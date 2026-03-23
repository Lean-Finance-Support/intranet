"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  TaxEntryForClient,
  TaxClientResponsePayload,
} from "@/lib/types/tax";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";

async function requireClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "client" || !profile.company_id) {
    throw new Error("Sin permisos");
  }

  return { supabase, user, companyId: profile.company_id };
}

export async function getClientQuarterData(
  year: number,
  quarter: number
): Promise<{
  notified: boolean;
  entries: TaxEntryForClient[];
  submitted: boolean;
  submitted_at: string | null;
}> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, companyId } = await requireClient();

  // Check if admin has notified for this quarter
  const { data: notification } = await supabase
    .from("tax_notifications")
    .select("notified_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .order("notified_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!notification) {
    return { notified: false, entries: [], submitted: false, submitted_at: null };
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
    return { notified: true, entries: [], submitted: false, submitted_at: null };
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

  const filledEntries = (rawEntries ?? []).filter(
    (e) => e.amount !== null && Number(e.amount) !== 0
  );

  if (filledEntries.length === 0) {
    return { notified: true, entries: [], submitted: false, submitted_at: null };
  }

  // Get client responses for these entries
  const entryIds = filledEntries.map((e) => e.id);
  const { data: responses } = await supabase
    .from("tax_client_responses")
    .select("tax_entry_id, approved, bank_account_id")
    .in("tax_entry_id", entryIds);

  const responsesByEntry = new Map(
    (responses ?? []).map((r) => [
      r.tax_entry_id,
      { approved: r.approved, bank_account_id: r.bank_account_id },
    ])
  );

  // Check if already submitted
  const { data: submission } = await supabase
    .from("tax_client_submissions")
    .select("submitted_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .maybeSingle();

  // Build result
  const modelsMap = new Map(models.map((m) => [m.id, m]));
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

  for (const response of responses) {
    const { error } = await supabase.from("tax_client_responses").upsert(
      {
        tax_entry_id: response.tax_entry_id,
        bank_account_id: response.bank_account_id ?? null,
        approved: response.approved,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "tax_entry_id" }
    );
    if (error) {
    console.error("[app/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
  }
}

export async function submitQuarter(
  year: number,
  quarter: number
): Promise<void> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, user, companyId } = await requireClient();

  // Insert submission record
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

  // Get technicians assigned to this company + department chief for notifications
  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", companyId)
    .single();

  const { data: technicians } = await supabase
    .from("company_technicians")
    .select("technician_id")
    .eq("company_id", companyId);

  const { data: fiscalDept } = await supabase
    .from("departments")
    .select("chief_id")
    .eq("slug", "asesoria-fiscal")
    .single();

  const recipients = new Set<string>();
  for (const t of technicians ?? []) recipients.add(t.technician_id);
  if (fiscalDept?.chief_id) recipients.add(fiscalDept.chief_id);

  const companyName = company?.legal_name ?? "Cliente";
  const quarterLabel = `${quarter}T ${year}`;

  // Create notifications for each recipient
  for (const recipientId of recipients) {
    await supabase.from("notifications").insert({
      recipient_id: recipientId,
      title: `${companyName} ha validado sus modelos`,
      message: `La empresa ${companyName} ha enviado sus respuestas de modelos de impuestos del ${quarterLabel}.`,
      link: `/modelos`,
    });
  }
}
