import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { ENISA_DOCUMENT_TYPES } from "@/lib/types/enisa";
import archiver from "archiver";
import { PassThrough } from "stream";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return new NextResponse("companyId requerido", { status: 400 });
  }

  const admin = createAdminClient();

  // Get company name for the zip filename
  const { data: company } = await admin
    .from("companies")
    .select("legal_name")
    .eq("id", companyId)
    .single();

  // Get all documents for this company
  const { data: documents } = await admin
    .from("enisa_documents")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at");

  if (!documents || documents.length === 0) {
    return new NextResponse("No hay documentos para descargar", { status: 404 });
  }

  // Build a map of type key to title for folder names
  const typeMap = new Map(
    ENISA_DOCUMENT_TYPES.map((dt) => [dt.key, `${dt.order.toString().padStart(2, "0")}_${sanitizeFolderName(dt.title)}`])
  );

  // Create archive
  const archive = archiver("zip", { zlib: { level: 5 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  // Download each file and add to archive
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

  // Convert passthrough stream to ReadableStream
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
