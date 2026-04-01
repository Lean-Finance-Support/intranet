"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import type { Company, TaxModelWithEntry, EntryPayload } from "@/lib/types/tax";
import { SERVICE_SLUGS } from "@/lib/types/services";

async function requireServiceAdmin(serviceSlug: string) {
  const { supabase, user, isSuperadmin } = await requireAdmin();

  // Superadmin siempre tiene acceso como chief a todos los servicios
  if (isSuperadmin) {
    return { supabase, user, isChief: true };
  }

  // Get all user's departments
  const { data: userDepts } = await supabase
    .from("profile_departments")
    .select("department_id")
    .eq("profile_id", user.id);

  const deptIds = (userDepts ?? []).map((d) => d.department_id as string);
  if (deptIds.length === 0) throw new Error("Sin departamento asignado");

  // Find if any of the user's departments has this service active
  const { data: deptServices } = await supabase
    .from("department_services")
    .select("department_id, service:services(slug)")
    .in("department_id", deptIds)
    .eq("is_active", true);

  const hasService = (deptServices ?? []).some((ds) => {
    const svc = (ds as unknown as { service: { slug: string } | null }).service;
    return svc?.slug === serviceSlug;
  });

  if (!hasService) throw new Error("Sin permisos para este servicio");

  // Get departments with this service to determine chief status
  const serviceDeptIds = (deptServices ?? [])
    .filter((ds) => {
      const svc = (ds as unknown as { service: { slug: string } | null }).service;
      return svc?.slug === serviceSlug;
    })
    .map((ds) => ds.department_id as string);

  const { data: chiefRecords } = await supabase
    .from("department_chiefs")
    .select("department_id")
    .eq("profile_id", user.id)
    .in("department_id", serviceDeptIds);

  const isChief = (chiefRecords ?? []).length > 0;

  return { supabase, user, isChief };
}

async function requireFiscalAdmin() {
  return requireServiceAdmin(SERVICE_SLUGS.TAX_MODELS);
}

export async function getAllCompanies(): Promise<Company[]> {
  const { supabase, user, isChief } = await requireFiscalAdmin();

  // Get the service id for tax-models
  const { data: svc } = await supabase
    .from("services")
    .select("id")
    .eq("slug", SERVICE_SLUGS.TAX_MODELS)
    .single();

  if (!svc) return [];

  // Get companies that have the tax-models service active
  const { data: companyServices } = await supabase
    .from("company_services")
    .select("company_id")
    .eq("service_id", svc.id)
    .eq("is_active", true);

  const serviceCompanyIds = (companyServices ?? []).map((cs) => cs.company_id);
  if (serviceCompanyIds.length === 0) return [];

  if (isChief) {
    // Chief sees all companies with the service contracted
    const { data, error } = await supabase
      .from("companies")
      .select("id, legal_name, company_name, nif")
      .in("id", serviceCompanyIds)
      .order("legal_name");

    if (error) {
      console.error("[admin/modelos] DB error:", error.code);
      throw new Error("Error al procesar la solicitud.");
    }
    return data ?? [];
  }

  // Non-chief: only companies assigned to this technician for this service
  const { data: assignments } = await supabase
    .from("company_technicians")
    .select("company_id")
    .eq("technician_id", user.id)
    .eq("service_id", svc.id);

  const assignedIds = (assignments ?? []).map((a) => a.company_id);
  const filteredIds = assignedIds.filter((id) => serviceCompanyIds.includes(id));
  if (filteredIds.length === 0) return [];

  const { data, error } = await supabase
    .from("companies")
    .select("id, legal_name, company_name, nif")
    .in("id", filteredIds)
    .order("legal_name");

  if (error) {
    console.error("[admin/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
  return data ?? [];
}

export async function getModelsWithEntries(
  companyId: string,
  year: number,
  quarter: number
): Promise<TaxModelWithEntry[]> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase } = await requireFiscalAdmin();

  const { data: models, error: modelsError } = await supabase
    .from("tax_models")
    .select("id, year, quarter, model_code, description, display_order, is_informative")
    .eq("year", year)
    .eq("quarter", quarter)
    .order("display_order");

  if (modelsError) {
    console.error("[admin/modelos] models query error:", modelsError.code);
    throw new Error("Error al procesar la solicitud.");
  }
  if (!models || models.length === 0) return [];

  const modelIds = models.map((m) => m.id);
  const { data: entries, error: entriesError } = await supabase
    .from("tax_entries")
    .select("tax_model_id, amount, entry_type")
    .eq("company_id", companyId)
    .in("tax_model_id", modelIds);

  if (entriesError) {
    console.error("[admin/modelos] entries query error:", entriesError.code);
    throw new Error("Error al procesar la solicitud.");
  }

  const entriesByModel = new Map(
    (entries ?? []).map((e) => [
      e.tax_model_id,
      { amount: Number(e.amount), entry_type: e.entry_type as "pagar" | "percibir" },
    ])
  );

  return models.map((m) => ({
    ...m,
    entry: entriesByModel.get(m.id) ?? null,
  }));
}

export async function getNotificationStatus(
  companyId: string,
  year: number,
  quarter: number
): Promise<{ notified: boolean; notified_at: string | null }> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase } = await requireFiscalAdmin();

  const { data } = await supabase
    .from("tax_notifications")
    .select("notified_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .order("notified_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    notified: !!data,
    notified_at: data?.notified_at ?? null,
  };
}

export async function saveEntries(entries: EntryPayload[]): Promise<void> {
  const { supabase, user } = await requireFiscalAdmin();

  for (const entry of entries) {
    const { error } = await supabase.from("tax_entries").upsert(
      {
        company_id: entry.company_id,
        tax_model_id: entry.tax_model_id,
        amount: entry.amount,
        entry_type: entry.entry_type,
        filled_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,tax_model_id" }
    );
    if (error) {
      console.error("[admin/modelos] DB error:", error.code);
      throw new Error("Error al procesar la solicitud.");
    }
  }
}

export async function notifyClient(
  companyId: string,
  year: number,
  quarter: number
): Promise<void> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, user } = await requireFiscalAdmin();

  const { error } = await supabase.from("tax_notifications").insert({
    company_id: companyId,
    year,
    quarter,
    notified_by: user.id,
  });

  if (error) {
    console.error("[notifyClient] insert tax_notification:", error);
    throw new Error("Error al registrar la notificación.");
  }

  // Buscar clientes asociados a esta empresa vía profile_companies
  const { data: profileLinks } = await supabase
    .from("profile_companies")
    .select("profile_id")
    .eq("company_id", companyId);

  const quarterLabel = `${quarter}T ${year}`;
  for (const link of profileLinks ?? []) {
    await supabase.from("notifications").insert({
      recipient_id: link.profile_id,
      company_id: companyId,
      title: "Modelos de impuestos disponibles",
      message: `Ya están disponibles tus modelos de prestación de impuestos del ${quarterLabel}. Accede para revisarlos y validarlos.`,
      link: "/modelos",
    });
  }
  // El email lo gestiona la Edge Function notify-tax-models
  // disparada automáticamente por el trigger en tax_notifications
}

export interface ClientResponseStatus {
  tax_model_id: string;
  approved: boolean;
  bank_account_iban: string;
  bank_account_label: string | null;
}

export async function getClientResponses(
  companyId: string,
  year: number,
  quarter: number
): Promise<{
  submitted: boolean;
  submitted_at: string | null;
  responses: ClientResponseStatus[];
}> {
  const { supabase } = await requireFiscalAdmin();

  const { data: submission } = await supabase
    .from("tax_client_submissions")
    .select("submitted_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .maybeSingle();

  const { data: models } = await supabase
    .from("tax_models")
    .select("id")
    .eq("year", year)
    .eq("quarter", quarter);

  if (!models || models.length === 0) {
    return { submitted: false, submitted_at: null, responses: [] };
  }

  const { data: entries } = await supabase
    .from("tax_entries")
    .select("id, tax_model_id")
    .eq("company_id", companyId)
    .in("tax_model_id", models.map((m) => m.id));

  if (!entries || entries.length === 0) {
    return { submitted: false, submitted_at: null, responses: [] };
  }

  const { data: rawResponses } = await supabase
    .from("tax_client_responses")
    .select("tax_entry_id, approved, bank_account:company_bank_accounts(iban, label)")
    .in("tax_entry_id", entries.map((e) => e.id));

  const entryToModel = new Map(entries.map((e) => [e.id, e.tax_model_id]));

  const responses: ClientResponseStatus[] = (rawResponses ?? []).map((r) => {
    const bank = r.bank_account as unknown as { iban: string; label: string | null } | null;
    return {
      tax_model_id: entryToModel.get(r.tax_entry_id) ?? "",
      approved: r.approved,
      bank_account_iban: bank?.iban ?? "",
      bank_account_label: bank?.label ?? null,
    };
  });

  return {
    submitted: !!submission,
    submitted_at: submission?.submitted_at ?? null,
    responses,
  };
}
