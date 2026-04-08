"use server";

import { requireClient } from "@/lib/require-client";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  TaxEntryForClient,
  TaxClientResponsePayload,
  TaxModelStatus,
} from "@/lib/types/tax";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";

export async function getClientQuarterData(
  year: number,
  quarter: number
): Promise<{
  notified: boolean;
  entries: TaxEntryForClient[];
  submitted: boolean;
  submitted_at: string | null;
  presented: boolean;
}> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, companyId } = await requireClient();

  // Check if admin has notified for this quarter
  const { data: notifications } = await supabase
    .from("tax_notifications")
    .select("notified_at, notification_type")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .order("notified_at", { ascending: false });

  const allNotifications = notifications ?? [];
  const notification = allNotifications[0] ?? null;
  const presented = allNotifications.some((n) => n.notification_type === "presentation");

  if (!notification) {
    return { notified: false, entries: [], submitted: false, submitted_at: null, presented: false };
  }

  // Get tax models for this quarter
  const { data: models, error: modelsError } = await supabase
    .from("tax_models")
    .select("id, model_code, description, display_order, is_informative")
    .eq("year", year)
    .eq("quarter", quarter)
    .order("display_order");

  if (modelsError) {
    console.error("[app/modelos] models query error:", modelsError.code);
    throw new Error("Error al procesar la solicitud.");
  }
  if (!models || models.length === 0) {
    return { notified: true, entries: [], submitted: false, submitted_at: null, presented };
  }

  // Get entries (only those with amount filled by admin)
  const modelIds = models.map((m) => m.id);
  const { data: rawEntries, error: entriesError } = await supabase
    .from("tax_entries")
    .select("id, tax_model_id, amount, entry_type")
    .eq("company_id", companyId)
    .in("tax_model_id", modelIds);

  if (entriesError) {
    console.error("[app/modelos] entries query error:", entriesError.code);
    throw new Error("Error al procesar la solicitud.");
  }

  const modelsMap = new Map(models.map((m) => [m.id, m]));
  // Include: non-informative with amount > 0, OR informative with any entry (even amount=0)
  const filledEntries = (rawEntries ?? []).filter((e) => {
    const model = modelsMap.get(e.tax_model_id);
    return model?.is_informative ? e.amount !== null : (e.amount !== null && Number(e.amount) !== 0);
  });

  if (filledEntries.length === 0) {
    return { notified: true, entries: [], submitted: false, submitted_at: null, presented };
  }

  // Get client responses for these entries
  const entryIds = filledEntries.map((e) => e.id);
  const { data: responses } = await supabase
    .from("tax_client_responses")
    .select("tax_entry_id, status, bank_account_id")
    .in("tax_entry_id", entryIds);

  const responsesByEntry = new Map(
    (responses ?? []).map((r) => [
      r.tax_entry_id,
      { status: r.status as TaxModelStatus, bank_account_id: r.bank_account_id },
    ])
  );

  // Check latest submission
  const { data: submission } = await supabase
    .from("tax_client_submissions")
    .select("submitted_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build result
  const entries: TaxEntryForClient[] = filledEntries.map((e) => {
    const model = modelsMap.get(e.tax_model_id)!;
    return {
      id: e.id,
      tax_model_id: e.tax_model_id,
      model_code: model.model_code,
      description: model.description,
      amount: Number(e.amount),
      entry_type: e.entry_type as "pagar" | "percibir",
      is_informative: model.is_informative ?? false,
      client_response: responsesByEntry.get(e.id) ?? null,
    };
  });

  // Sort by display_order
  const orderMap = new Map(models.map((m) => [m.id, m.display_order]));
  entries.sort(
    (a, b) => (orderMap.get(a.tax_model_id) ?? 0) - (orderMap.get(b.tax_model_id) ?? 0)
  );

  return {
    notified: true,
    entries,
    submitted: !!submission,
    submitted_at: submission?.submitted_at ?? null,
    presented,
  };
}

export async function getBankAccounts(): Promise<CompanyBankAccount[]> {
  const { supabase, companyId } = await requireClient();

  const { data, error } = await supabase
    .from("company_bank_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false });

  if (error) {
    console.error("[app/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
  return data ?? [];
}

export async function addBankAccount(
  iban: string,
  label: string | null,
  bankName: string | null
): Promise<CompanyBankAccount> {
  const { supabase, companyId } = await requireClient();

  // Check if this is the first account (make it default)
  const { count } = await supabase
    .from("company_bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  const isFirst = (count ?? 0) === 0;

  const { data, error } = await supabase
    .from("company_bank_accounts")
    .insert({
      company_id: companyId,
      iban: iban.replace(/\s/g, "").toUpperCase(),
      label,
      bank_name: bankName,
      is_default: isFirst,
    })
    .select()
    .single();

  if (error) {
    console.error("[app/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
  return data;
}

export async function saveClientResponses(
  responses: TaxClientResponsePayload[]
): Promise<void> {
  const { supabase, user } = await requireClient();

  const now = new Date().toISOString();
  const rows = responses.map((r) => ({
    tax_entry_id: r.tax_entry_id,
    bank_account_id: r.bank_account_id ?? null,
    status: r.status,
    approved: r.status === "accepted",
    approved_by: user.id,
    approved_at: now,
  }));

  const { error } = await supabase
    .from("tax_client_responses")
    .upsert(rows, { onConflict: "tax_entry_id" });

  if (error) {
    console.error("[app/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
}

export async function getAdvisorContactInfo(): Promise<{
  emails: string[];
  companyName: string;
}> {
  const { supabase, companyId } = await requireClient();
  const admin = createAdminClient();

  const [{ data: company }, { data: taxService }] = await Promise.all([
    supabase
      .from("companies")
      .select("legal_name, company_name")
      .eq("id", companyId)
      .single(),
    admin
      .from("services")
      .select("id")
      .eq("slug", "tax-models")
      .single(),
  ]);

  const companyName = company?.company_name ?? company?.legal_name ?? "";

  if (!taxService) return { emails: [], companyName };

  const { data: technicians } = await admin
    .from("company_technicians")
    .select("profile:profiles(email)")
    .eq("company_id", companyId)
    .eq("service_id", taxService.id);

  const techEmails = (technicians ?? [])
    .map((t) => (t.profile as unknown as { email: string } | null)?.email)
    .filter(Boolean) as string[];

  if (techEmails.length > 0) return { emails: techEmails, companyName };

  // Fallback: chiefs del departamento fiscal
  const { data: fiscalDept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "asesoria-fiscal")
    .single();

  if (!fiscalDept) return { emails: [], companyName };

  const { data: chiefs } = await admin
    .from("department_chiefs")
    .select("profile:profiles(email)")
    .eq("department_id", fiscalDept.id);

  const chiefEmails = (chiefs ?? [])
    .map((c) => (c.profile as unknown as { email: string } | null)?.email)
    .filter(Boolean) as string[];

  return { emails: chiefEmails, companyName };
}

export async function submitQuarter(
  year: number,
  quarter: number
): Promise<void> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, user, companyId } = await requireClient();

  // Insert new submission record (multiple allowed)
  const { error: submitError } = await supabase
    .from("tax_client_submissions")
    .insert({
      company_id: companyId,
      year,
      quarter,
      submitted_by: user.id,
    });

  if (submitError) {
    console.error("[app/modelos] submit error:", submitError.code);
    throw new Error("Error al enviar el trimestre.");
  }

  // Get technicians assigned to this company + department chiefs for notifications
  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", companyId)
    .single();

  // Get the tax-models service id
  const { data: taxService } = await supabase
    .from("services")
    .select("id")
    .eq("slug", "tax-models")
    .single();

  const { data: technicians } = taxService
    ? await supabase
        .from("company_technicians")
        .select("technician_id")
        .eq("company_id", companyId)
        .eq("service_id", taxService.id)
    : { data: null };

  // Get fiscal department chiefs
  const { data: fiscalDept } = await supabase
    .from("departments")
    .select("id")
    .eq("slug", "asesoria-fiscal")
    .single();

  const { data: chiefs } = fiscalDept
    ? await supabase
        .from("department_chiefs")
        .select("profile_id")
        .eq("department_id", fiscalDept.id)
    : { data: null };

  const recipients = new Set<string>();
  for (const t of technicians ?? []) recipients.add(t.technician_id);
  for (const c of chiefs ?? []) recipients.add(c.profile_id);

  const companyName = company?.legal_name ?? "Cliente";
  const quarterLabel = `${quarter}T ${year}`;

  // Create notifications for all recipients in a single insert
  const notificationRows = [...recipients].map((recipientId) => ({
    recipient_id: recipientId,
    company_id: companyId,
    title: `${companyName} ha enviado sus respuestas`,
    message: `La empresa ${companyName} ha enviado sus respuestas de modelos de impuestos del ${quarterLabel}.`,
    link: `/modelos`,
  }));

  if (notificationRows.length > 0) {
    await supabase.from("notifications").insert(notificationRows);
  }
}
