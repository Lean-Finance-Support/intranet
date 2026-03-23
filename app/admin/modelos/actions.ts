"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { Company, TaxModelWithEntry, EntryPayload } from "@/lib/types/tax";
import { SERVICE_SLUGS } from "@/lib/types/services";

async function requireServiceAdmin(serviceSlug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, department_id")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    throw new Error("Sin permisos");
  }

  const isSuperadmin = profile.role === "superadmin";

  // Superadmin uses cookie-based department, regular admin uses profile department
  let departmentId = profile.department_id;
  if (isSuperadmin) {
    const cookieStore = await cookies();
    departmentId = cookieStore.get("sa-department-id")?.value ?? null;
  }

  if (!departmentId) {
    throw new Error("Sin departamento asignado");
  }

  const { data: departmentService } = await supabase
    .from("department_services")
    .select("id, service:services(slug)")
    .eq("department_id", departmentId)
    .eq("is_active", true)
    .eq("services.slug", serviceSlug)
    .not("service", "is", null)
    .maybeSingle();

  if (!departmentService) {
    throw new Error("Sin permisos para este servicio");
  }

  // Check if user is the department chief — superadmin is always chief
  const { data: dept } = await supabase
    .from("departments")
    .select("chief_id")
    .eq("id", departmentId)
    .single();

  const isChief = isSuperadmin || dept?.chief_id === user.id;

  return { supabase, user, departmentId, isChief };
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

  // Non-chief: only companies assigned to this technician AND with the service
  const { data: assignments } = await supabase
    .from("company_technicians")
    .select("company_id")
    .eq("technician_id", user.id);

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

  // Create notifications for all client users of this company
  const { data: clientProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", "client");

  const quarterLabel = `${quarter}T ${year}`;
  for (const client of clientProfiles ?? []) {
    await supabase.from("notifications").insert({
      recipient_id: client.id,
      title: "Modelos de impuestos disponibles",
      message: `Ya están disponibles tus modelos de prestación de impuestos del ${quarterLabel}. Accede para revisarlos y validarlos.`,
      link: "/modelos",
    });
  }
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

  // Check submission status
  const { data: submission } = await supabase
    .from("tax_client_submissions")
    .select("submitted_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .maybeSingle();

  // Get entries for this company/quarter
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

  // Get client responses with bank account info
  const { data: rawResponses } = await supabase
    .from("tax_client_responses")
    .select("tax_entry_id, approved, bank_account:company_bank_accounts(iban, label)")
    .in("tax_entry_id", entries.map((e) => e.id));

  // Map entry_id → model_id for response lookup
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
