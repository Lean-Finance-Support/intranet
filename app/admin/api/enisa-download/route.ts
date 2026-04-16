import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission, userScopeIds } from "@/lib/require-permission";
import { createAdminClient } from "@/lib/supabase/server";
import { ENISA_DOCUMENT_TYPES } from "@/lib/types/enisa";
import { SERVICE_SLUGS } from "@/lib/types/services";
import archiver from "archiver";
import { PassThrough } from "stream";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return new NextResponse("companyId requerido", { status: 400 });
  }

  try {
    const { supabase } = await requireAdmin();

    const { data: svc } = await supabase
      .from("services")
      .select("id")
      .eq("slug", SERVICE_SLUGS.ENISA_DOCS)
      .single();
    if (!svc) return new NextResponse("Servicio no existe", { status: 404 });

    const { data: deptSvcs } = await supabase
      .from("department_services")
      .select("department_id")
      .eq("service_id", svc.id)
      .eq("is_active", true);

    const serviceDeptIds = new Set((deptSvcs ?? []).map((d) => d.department_id as string));
    if (serviceDeptIds.size === 0) {
      return new NextResponse("Sin departamento con este servicio", { status: 403 });
    }

    const [viewable, writable] = await Promise.all([
      userScopeIds("view_enisa_submissions", "department"),
      userScopeIds("review_enisa_submission", "department"),
    ]);

    const canView = viewable.some((id) => serviceDeptIds.has(id));
    if (!canView) {
      return new NextResponse("Sin permisos para este servicio", { status: 403 });
    }

    const isChief = writable.some((id) => serviceDeptIds.has(id));

    if (!isChief) {
      const { data: cs } = await supabase
        .from("company_services")
        .select("id")
        .eq("company_id", companyId)
        .eq("service_id", svc.id)
        .maybeSingle();
      if (!cs) {
        return new NextResponse("Empresa sin servicio ENISA contratado", { status: 403 });
      }

      const ok = await hasPermission("view_assigned_company", {
        type: "company_service",
        companyServiceId: cs.id,
      });
      if (!ok) {
        return new NextResponse("Sin permisos sobre esta empresa", { status: 403 });
      }
    }
  } catch {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const admin = createAdminClient();

  const { data: company } = await admin
    .from("companies")
    .select("legal_name")
    .eq("id", companyId)
    .single();

  const { data: documents } = await admin
    .from("enisa_documents")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at");

  if (!documents || documents.length === 0) {
    return new NextResponse("No hay documentos para descargar", { status: 404 });
  }

  const typeMap = new Map(
    ENISA_DOCUMENT_TYPES.map((dt) => [dt.key, `${dt.order.toString().padStart(2, "0")}_${sanitizeFolderName(dt.title)}`])
  );

  const archive = archiver("zip", { zlib: { level: 5 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  for (const doc of documents) {
    const { data: fileData, error } = await admin.storage
      .from("enisa-documents")
      .download(doc.file_path);

    if (error || !fileData) {
      console.error(`[enisa-download] Error downloading ${doc.file_path}:`, error);
      continue;
    }

    const folderName = typeMap.get(doc.document_type_key) ?? doc.document_type_key;
    const buffer = Buffer.from(await fileData.arrayBuffer());
    archive.append(buffer, { name: `${folderName}/${doc.file_name}` });
  }

  archive.finalize();

  const readable = new ReadableStream({
    start(controller) {
      passthrough.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      passthrough.on("end", () => {
        controller.close();
      });
      passthrough.on("error", (err) => {
        controller.error(err);
      });
    },
  });

  const safeName = sanitizeFolderName(company?.legal_name ?? "empresa");

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="ENISA_${safeName}.zip"`,
    },
  });
}

function sanitizeFolderName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}
