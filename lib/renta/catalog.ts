/**
 * Helpers de acceso a BD del schema `renta`.
 * Se invoca desde server actions tanto admin como públicas.
 */

import { createAdminClient } from "@/lib/supabase/server";
import type {
  CCAACode,
  RentaAuthorizedFiler,
  RentaDeduction,
  RentaInvitation,
} from "@/lib/types/renta";

/**
 * Resuelve la invitation activa por token. Devuelve null si no existe o
 * está revocada/expirada.
 */
export async function loadInvitationByToken(token: string): Promise<RentaInvitation | null> {
  if (!token || typeof token !== "string") return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("renta")
    .from("invitations")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  if (data.status !== "activa") return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as RentaInvitation;
}

/**
 * Busca un DNI dentro de la lista de autorizados de una empresa.
 * DNI debe venir ya normalizado.
 */
export async function findAuthorizedFiler(
  companyId: string,
  dni: string,
): Promise<RentaAuthorizedFiler | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .schema("renta")
    .from("authorized_filers")
    .select("*")
    .eq("company_id", companyId)
    .eq("dni", dni)
    .maybeSingle();
  return (data as RentaAuthorizedFiler) ?? null;
}

/**
 * ¿Ya envió este DNI una submission para esta invitation?
 */
export async function hasSubmissionForFiler(
  invitationId: string,
  authorizedFilerId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .schema("renta")
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("invitation_id", invitationId)
    .eq("authorized_filer_id", authorizedFilerId);
  return (count ?? 0) > 0;
}

/**
 * Carga las deducciones activas filtrando por CCAA. Si no se especifica,
 * devuelve todas las activas (para el form público que aún no conoce la CCAA).
 */
export async function loadActiveDeductions(ccaa?: CCAACode): Promise<RentaDeduction[]> {
  const supabase = createAdminClient();
  let query = supabase
    .schema("renta")
    .from("deductions")
    .select("*")
    .eq("is_active", true)
    .order("display_order");
  if (ccaa) query = query.eq("ccaa_code", ccaa);
  const { data } = await query;
  return (data as RentaDeduction[]) ?? [];
}

/**
 * Genera token URL-safe (43 chars base64url de 32 bytes random).
 */
export function generateInvitationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
