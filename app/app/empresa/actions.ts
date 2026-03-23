"use server";

import { createClient } from "@/lib/supabase/server";
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

export interface CompanyInfo {
  id: string;
  company_name: string | null;
  nif: string | null;
  phone: string | null;
  address: string | null;
  accounts: { id: string; full_name: string | null; email: string }[];
  bank_accounts: CompanyBankAccount[];
}

export async function getCompanyInfo(): Promise<CompanyInfo> {
  const { supabase, companyId } = await requireClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_name, nif, phone, address")
    .eq("id", companyId)
    .single();

  if (companyError || !company) throw new Error("Empresa no encontrada");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("company_id", companyId)
    .order("full_name");

  const { data: bankAccounts } = await supabase
    .from("company_bank_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false });

  return {
    ...company,
    accounts: (profiles ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
    })),
    bank_accounts: (bankAccounts ?? []) as CompanyBankAccount[],
  };
}

export async function updateCompanyContact(
  phone: string | null,
  address: string | null
): Promise<void> {
  const { supabase, companyId } = await requireClient();

  const { error } = await supabase
    .from("companies")
    .update({ phone, address, updated_at: new Date().toISOString() })
    .eq("id", companyId);

  if (error) {
    console.error("[app/empresa] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
}

export async function addCompanyBankAccount(
  iban: string,
  label: string | null,
  bankName: string | null
): Promise<CompanyBankAccount> {
  const { supabase, companyId } = await requireClient();

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
    console.error("[app/empresa] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
  return data;
}

export async function updateCompanyBankAccount(
  accountId: string,
  iban: string,
  label: string | null,
  bankName: string | null
): Promise<void> {
  const { supabase, companyId } = await requireClient();

  const { error } = await supabase
    .from("company_bank_accounts")
    .update({
      iban: iban.replace(/\s/g, "").toUpperCase(),
      label,
      bank_name: bankName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId)
    .eq("company_id", companyId);

  if (error) {
    console.error("[app/empresa] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
}

export async function deleteCompanyBankAccount(
  accountId: string
): Promise<void> {
  const { supabase, companyId } = await requireClient();

  const { error } = await supabase
    .from("company_bank_accounts")
    .delete()
    .eq("id", accountId)
    .eq("company_id", companyId);

  if (error) {
    console.error("[app/empresa] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
}
