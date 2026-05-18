"use server";

import { requireAdmin } from "@/lib/require-admin";
import { requirePermission } from "@/lib/require-permission";
import { createAdminClient } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/storage/upload-validation";
import { extractProposal } from "@/lib/proposal-import/extract";
import { normalizeNif } from "@/lib/proposal-import/nif";
import { addServiceToCompany } from "@/app/admin/clientes/actions";
import type {
  ImportProposalResult,
  ServiceCatalogItem,
} from "@/lib/proposal-import/types";

// Los 3 permisos del onboarding — la importación es solo otra puerta de entrada
// al mismo flujo, así que exige exactamente lo mismo.
async function requireImportAccess() {
  await requireAdmin();
  await requirePermission("create_company");
  await requirePermission("manage_client_accounts");
  await requirePermission("request_client_documentation");
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
