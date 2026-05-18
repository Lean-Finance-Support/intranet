"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { requirePermission } from "@/lib/require-permission";
import { getAuthUser } from "@/lib/cached-queries";
import { createAdminClient } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/storage/upload-validation";
import {
  DOCUMENTATION_BUCKET,
  buildDocumentationStoragePath,
} from "@/lib/storage/documentation";
import { extractProposal } from "@/lib/proposal-import/extract";
import { normalizeNif } from "@/lib/proposal-import/nif";
import { addServiceToCompany } from "@/app/admin/clientes/actions";
import type {
  ImportProposalResult,
  ServiceCatalogItem,
} from "@/lib/proposal-import/types";

// Apartado del catálogo al que se adjunta automáticamente la propuesta.
const PROPOSAL_BLOCK_SLUG = "contratos";
const PROPOSAL_APARTADO_NAME = "Propuesta comercial";

// Los 3 permisos del onboarding — la importación es solo otra puerta de entrada
// al mismo flujo, así que exige exactamente lo mismo.
async function requireImportAccess() {
  await requireAdmin();
  await requirePermission("create_company");
  await requirePermission("manage_client_accounts");
  await requirePermission("request_client_documentation");
}

interface ProposalFileInput {
  fileName: string;
  mimeType: string;
  /** PDF en base64 (sin el prefijo data:). */
  base64: string;
}

/**
 * Adjunta el PDF de la propuesta al apartado "Propuesta comercial" de la
 * documentación del cliente. Crea el bloque/apartado del cliente si no existen
 * y reabre el apartado si estaba validado (no se puede adjuntar a uno validado).
 * No re-chequea permisos — lo hacen quienes la invocan.
 */
async function attachProposalImpl(
  companyId: string,
  file: ProposalFileInput,
  userId: string
): Promise<void> {
  const admin = createAdminClient();
  const buffer = Buffer.from(file.base64, "base64");
  validateUpload({
    mimeType: file.mimeType,
    fileName: file.fileName,
    sizeBytes: buffer.byteLength,
  });

  // 1. Localizar el apartado "Propuesta comercial" del catálogo.
  const { data: block } = await admin
    .schema("documentation")
    .from("blocks")
    .select("id")
    .eq("slug", PROPOSAL_BLOCK_SLUG)
    .maybeSingle();
  if (!block) {
    throw new Error(`No existe el bloque "${PROPOSAL_BLOCK_SLUG}" en el catálogo.`);
  }
  const blockId = block.id as string;

  const { data: apartado } = await admin
    .schema("documentation")
    .from("apartados")
    .select("id")
    .eq("block_id", blockId)
    .eq("name", PROPOSAL_APARTADO_NAME)
    .maybeSingle();
  if (!apartado) {
    throw new Error(`No existe el apartado "${PROPOSAL_APARTADO_NAME}" en el catálogo.`);
  }
  const apartadoId = apartado.id as string;

  // 2. client_block (empresa ↔ bloque) — crear si falta.
  let clientBlockId: string;
  const { data: cb } = await admin
    .schema("documentation")
    .from("client_blocks")
    .select("id")
    .eq("company_id", companyId)
    .eq("block_id", blockId)
    .maybeSingle();
  if (cb) {
    clientBlockId = cb.id as string;
  } else {
    const { data: newCb, error } = await admin
      .schema("documentation")
      .from("client_blocks")
      .insert({ company_id: companyId, block_id: blockId, added_by: userId })
      .select("id")
      .single();
    if (error || !newCb) {
      throw new Error("No se pudo asignar el bloque de documentación al cliente.");
    }
    clientBlockId = newCb.id as string;
  }

  // 3. client_apartado — crear si falta.
  let clientApartadoId: string;
  let status: string;
  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("id, status")
    .eq("client_block_id", clientBlockId)
    .eq("apartado_id", apartadoId)
    .maybeSingle();
  if (ca) {
    clientApartadoId = ca.id as string;
    status = ca.status as string;
  } else {
    const { data: newCa, error } = await admin
      .schema("documentation")
      .from("client_apartados")
      .insert({
        client_block_id: clientBlockId,
        apartado_id: apartadoId,
        added_by: userId,
        is_optional: true,
      })
      .select("id, status")
      .single();
    if (error || !newCa) {
      throw new Error("No se pudo crear el apartado de documentación.");
    }
    clientApartadoId = newCa.id as string;
    status = newCa.status as string;
    await admin.schema("documentation").from("apartado_status_history").insert({
      client_apartado_id: clientApartadoId,
      from_status: null,
      to_status: status,
      changed_by: userId,
      reason: "Importación de propuesta",
    });
  }

  // 4. Si está validado, reabrir — no se puede adjuntar a un apartado validado.
  if (status === "validado") {
    const { error } = await admin
      .schema("documentation")
      .from("client_apartados")
      .update({
        status: "pendiente",
        validated_at: null,
        validated_by: null,
        rejected_at: null,
        rejected_by: null,
        last_rejection_reason: null,
      })
      .eq("id", clientApartadoId);
    if (error) throw new Error("No se pudo reabrir el apartado validado.");
    await admin.schema("documentation").from("apartado_status_history").insert({
      client_apartado_id: clientApartadoId,
      from_status: "validado",
      to_status: "pendiente",
      changed_by: userId,
      reason: "__event:reopened__",
    });
    status = "pendiente";
  }

  // 5. Subir el PDF y registrar el archivo.
  const fileId = crypto.randomUUID();
  const storagePath = buildDocumentationStoragePath({
    companyId,
    clientApartadoId,
    fileId,
    fileName: file.fileName,
  });
  const { error: upErr } = await admin.storage
    .from(DOCUMENTATION_BUCKET)
    .upload(storagePath, buffer, { contentType: file.mimeType });
  if (upErr) throw new Error(upErr.message);

  const { error: insErr } = await admin
    .schema("documentation")
    .from("apartado_files")
    .insert({
      id: fileId,
      client_apartado_id: clientApartadoId,
      storage_path: storagePath,
      file_name: file.fileName,
      file_size: buffer.byteLength,
      mime_type: file.mimeType,
      uploaded_by: userId,
    });
  if (insErr) throw new Error(insErr.message);

  await admin.schema("documentation").from("apartado_status_history").insert({
    client_apartado_id: clientApartadoId,
    from_status: status,
    to_status: status,
    changed_by: userId,
    reason: "__event:file_uploaded__",
  });

  revalidateTag(`doc:client:${companyId}`, { expire: 0 });
  revalidatePath(`/admin/clientes/${companyId}`);
}

export interface AttachProposalInput {
  companyId: string;
  fileName: string;
  mimeType: string;
  base64: string;
}

/**
 * Server action: adjunta el PDF de la propuesta a la documentación del cliente.
 * La usa la rama "empresa nueva" tras cerrar el onboarding (la empresa no existe
 * hasta entonces). En la rama "empresa existente" el adjuntado lo hace ya
 * `importProposal`.
 */
export async function attachProposalToDocumentation(
  input: AttachProposalInput
): Promise<void> {
  await requireImportAccess();
  const { user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");
  if (input.mimeType !== "application/pdf") {
    throw new Error("Solo se admiten archivos PDF.");
  }
  await attachProposalImpl(
    input.companyId,
    { fileName: input.fileName, mimeType: input.mimeType, base64: input.base64 },
    user.id
  );
}

export interface ImportProposalInput {
  fileName: string;
  mimeType: string;
  /** PDF codificado en base64 (sin el prefijo data:). */
  base64: string;
}

/**
 * Procesa un PDF de propuesta firmada: extrae los datos con la API de Claude y,
 * según si el NIF ya existe en BD, devuelve la rama a renderizar (new /
 * existing / soft_deleted). El PDF se procesa en memoria, no se persiste.
 */
export async function importProposal(
  input: ImportProposalInput
): Promise<ImportProposalResult> {
  await requireImportAccess();

  validateUpload({
    mimeType: input.mimeType,
    fileName: input.fileName,
    sizeBytes: Buffer.byteLength(input.base64, "base64"),
  });
  if (input.mimeType !== "application/pdf") {
    throw new Error("Solo se admiten archivos PDF.");
  }

  const admin = createAdminClient();
  const { data: serviceRows, error: catErr } = await admin
    .from("services")
    .select("id, name, slug")
    .eq("is_active", true);
  if (catErr) {
    throw new Error("No se pudo cargar el catálogo de servicios.");
  }
  const catalog: ServiceCatalogItem[] = (serviceRows ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    slug: s.slug as string,
  }));
  const serviceNameById = new Map(catalog.map((s) => [s.id, s.name]));

  const pdfBytes = Buffer.from(input.base64, "base64");
  const extraction = await extractProposal(pdfBytes, catalog);

  const nif = normalizeNif(extraction.company.nif);
  const { data: company } = nif
    ? await admin
        .from("companies")
        .select("id, legal_name, company_name, deleted_at")
        .eq("nif", nif)
        .maybeSingle()
    : { data: null };

  // Empresa nueva — sin fila para ese NIF.
  if (!company) {
    return { mode: "new", extraction };
  }

  // Empresa archivada — bloqueante, no auto-restauramos.
  if (company.deleted_at) {
    return {
      mode: "soft_deleted",
      company: { id: company.id as string, legal_name: company.legal_name as string },
    };
  }

  // Empresa existente activa — calcular qué servicios son nuevos.
  const { data: csRows } = await admin
    .from("company_services")
    .select("service_id")
    .eq("company_id", company.id as string)
    .eq("is_active", true);
  const contractedIds = new Set((csRows ?? []).map((r) => r.service_id as string));

  const new_services: { service_id: string; name: string; raw_text: string }[] = [];
  const already_contracted: { service_id: string; name: string }[] = [];
  const seenNew = new Set<string>();
  const seenContracted = new Set<string>();
  for (const svc of extraction.services) {
    if (svc.confidence !== "high" || !svc.service_id) continue;
    const name = serviceNameById.get(svc.service_id);
    if (!name) continue;
    if (contractedIds.has(svc.service_id)) {
      if (!seenContracted.has(svc.service_id)) {
        seenContracted.add(svc.service_id);
        already_contracted.push({ service_id: svc.service_id, name });
      }
    } else if (!seenNew.has(svc.service_id)) {
      seenNew.add(svc.service_id);
      new_services.push({ service_id: svc.service_id, name, raw_text: svc.raw_text });
    }
  }

  const unmatched_raw = extraction.services
    .filter((s) => s.confidence !== "high" || !s.service_id)
    .map((s) => s.raw_text)
    .filter((t) => t.trim());

  // La empresa ya existe → adjuntamos la propuesta a su documentación ahora
  // mismo (en la rama "nueva" se hace tras cerrar el onboarding). Un fallo aquí
  // no debe tumbar la importación: se reporta con proposal_attached=false.
  let proposal_attached = false;
  try {
    const { user } = await getAuthUser();
    if (user) {
      await attachProposalImpl(
        company.id as string,
        { fileName: input.fileName, mimeType: input.mimeType, base64: input.base64 },
        user.id
      );
      proposal_attached = true;
    }
  } catch (e) {
    console.error("[importProposal] adjuntar propuesta a documentación:", e);
  }

  return {
    mode: "existing",
    company: {
      id: company.id as string,
      legal_name: company.legal_name as string,
      company_name: (company.company_name as string | null) ?? null,
    },
    extraction,
    new_services,
    already_contracted,
    unmatched_raw,
    proposal_attached,
  };
}

export interface AddServiceOutcome {
  service_id: string;
  ok: boolean;
  error: string | null;
}

/**
 * Contrata los servicios indicados para una empresa existente. Tolerante a
 * fallo parcial: intenta cada servicio y devuelve un resumen por servicio.
 */
export async function addServicesFromProposal(
  companyId: string,
  serviceIds: string[]
): Promise<AddServiceOutcome[]> {
  await requireImportAccess();

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("id, deleted_at")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) throw new Error("La empresa no existe.");
  if (company.deleted_at) {
    throw new Error("La empresa está archivada — restáurala antes de añadir servicios.");
  }

  const outcomes: AddServiceOutcome[] = [];
  for (const serviceId of serviceIds) {
    try {
      await addServiceToCompany(companyId, serviceId);
      outcomes.push({ service_id: serviceId, ok: true, error: null });
    } catch (e) {
      outcomes.push({
        service_id: serviceId,
        ok: false,
        error: e instanceof Error ? e.message : "Error al añadir el servicio.",
      });
    }
  }
  return outcomes;
}
