"use server";

import { createClient } from "@/lib/supabase/server";
import type { Company, TaxModelWithEntry, EntryPayload } from "@/lib/types/tax";

async function requireFiscalAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, department")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin" || profile.department !== "Asesoría Fiscal") {
    throw new Error("Sin permisos");
  }

  return { supabase, user };
}

export async function getAllCompanies(): Promise<Company[]> {
  const { supabase } = await requireFiscalAdmin();

  const { data, error } = await supabase
    .from("companies")
    .select("id, company_name, nif")
    .order("company_name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getModelsWithEntries(
  companyId: string,
  year: number,
  quarter: number
): Promise<TaxModelWithEntry[]> {
  const { supabase } = await requireFiscalAdmin();

  const { data: models, error: modelsError } = await supabase
    .from("tax_models")
    .select("id, year, quarter, model_code, description, display_order")
    .eq("year", year)
    .eq("quarter", quarter)
    .order("display_order");

  if (modelsError) throw new Error(modelsError.message);
  if (!models || models.length === 0) return [];

  const modelIds = models.map((m) => m.id);
  const { data: entries, error: entriesError } = await supabase
    .from("tax_entries")
    .select("tax_model_id, amount, entry_type")
    .eq("company_id", companyId)
    .in("tax_model_id", modelIds);

  if (entriesError) throw new Error(entriesError.message);

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
    if (error) throw new Error(error.message);
  }
}

export async function notifyClient(
  companyId: string,
  year: number,
  quarter: number
): Promise<void> {
  const { supabase, user } = await requireFiscalAdmin();

  const { error } = await supabase.from("tax_notifications").insert({
    company_id: companyId,
    year,
    quarter,
    notified_by: user.id,
  });

  if (error) throw new Error(error.message);
}
