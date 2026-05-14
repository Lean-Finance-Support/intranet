"use server";

import { updateTag } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { generateInvitationToken } from "@/lib/renta/catalog";
import { normalizeDni, isValidDni } from "@/lib/renta/dni";
import { SERVICE_SLUGS } from "@/lib/types/services";
import type {
  RentaAuthorizedFiler,
  RentaAuthorizedFilerWithUsage,
  RentaInvitation,
  RentaSubmission,
  RentaSubmissionStatus,
} from "@/lib/types/renta";

/**
 * Verifica que la empresa tiene el servicio "Declaración de la renta" contratado.
 * Devuelve true si está activo, false en caso contrario.
 */
async function hasRentaService(companyId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("company_services")
    .select("services!inner(slug)")
    .eq("company_id", companyId)
    .eq("services.slug", SERVICE_SLUGS.DECLARACION_RENTA)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function assertCompanyHasRentaService(companyId: string): Promise<void> {
  if (!(await hasRentaService(companyId))) {
    throw new Error("La empresa no tiene contratado el servicio 'Declaración de la renta'.");
  }
}

// ===========================================================================
// Authorized filers (DNIs pre-autorizados)
// ===========================================================================

export async function listAuthorizedFilers(
  companyId: string,
): Promise<RentaAuthorizedFilerWithUsage[]> {
  await requireAdmin();
  const supabase = createAdminClient().schema("renta");

  const [filersRes, submissionsRes] = await Promise.all([
    supabase
      .from("authorized_filers")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at"),
    supabase
      .from("submissions")
      .select("authorized_filer_id")
      .eq("company_id", companyId),
  ]);

  const submittedIds = new Set(
    (submissionsRes.data ?? []).map((r: { authorized_filer_id: string }) => r.authorized_filer_id),
  );
  const rows = (filersRes.data ?? []) as RentaAuthorizedFiler[];
  return rows.map((f) => ({ ...f, has_submission: submittedIds.has(f.id) }));
}

export async function addAuthorizedFiler(
  companyId: string,
  input: { dni: string; full_name: string; email?: string | null; notes?: string | null },
): Promise<{ ok: true; filer: RentaAuthorizedFiler } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  await assertCompanyHasRentaService(companyId);

  const fullName = input.full_name?.trim();
  if (!fullName) return { ok: false, error: "El nombre completo es obligatorio." };

  const dni = normalizeDni(input.dni ?? "");
  if (!isValidDni(dni)) return { ok: false, error: "DNI/NIE inválido." };

  const supabase = createAdminClient().schema("renta");
  const { data, error } = await supabase
    .from("authorized_filers")
    .insert({
      company_id: companyId,
      dni,
      full_name: fullName,
      email: input.email?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Este DNI ya estaba autorizado para esta empresa." };
    }
    return { ok: false, error: error.message };
  }
  updateTag(`renta:filers:${companyId}`);
  return { ok: true, filer: data as RentaAuthorizedFiler };
}

export async function updateAuthorizedFiler(
  filerId: string,
  patch: { full_name?: string; email?: string | null; notes?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = createAdminClient().schema("renta");

  const update: Record<string, unknown> = {};
  if (patch.full_name !== undefined) {
    const v = patch.full_name.trim();
    if (!v) return { ok: false, error: "El nombre no puede estar vacío." };
    update.full_name = v;
  }
  if (patch.email !== undefined) update.email = patch.email?.trim() || null;
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;

  const { data, error } = await supabase
    .from("authorized_filers")
    .update(update)
    .eq("id", filerId)
    .select("company_id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (data?.company_id) updateTag(`renta:filers:${data.company_id}`);
  return { ok: true };
}

export async function deleteAuthorizedFiler(
  filerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = createAdminClient().schema("renta");

  const { data: filer } = await supabase
    .from("authorized_filers")
    .select("id, company_id")
    .eq("id", filerId)
    .maybeSingle();
  if (!filer) return { ok: false, error: "DNI autorizado no encontrado." };

  // Comprobar si tiene submissions (ON DELETE RESTRICT lo bloquearía).
  const { count } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("authorized_filer_id", filerId);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "No se puede eliminar: este DNI ya ha enviado el formulario." };
  }

  const { error } = await supabase.from("authorized_filers").delete().eq("id", filerId);
  if (error) return { ok: false, error: error.message };
  updateTag(`renta:filers:${filer.company_id}`);
  return { ok: true };
}

// ===========================================================================
// Invitations (token público por empresa)
// ===========================================================================

export async function getActiveInvitation(companyId: string): Promise<RentaInvitation | null> {
  await requireAdmin();
  const supabase = createAdminClient().schema("renta");
  const { data } = await supabase
    .from("invitations")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "activa")
    .maybeSingle();
  return (data as RentaInvitation) ?? null;
}

export async function ensureRentaInvitation(
  companyId: string,
): Promise<{ ok: true; invitation: RentaInvitation; url: string } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  await assertCompanyHasRentaService(companyId);

  const supabase = createAdminClient().schema("renta");

  // ¿Hay una activa?
  const existing = await getActiveInvitation(companyId);
  if (existing) {
    return { ok: true, invitation: existing, url: buildPublicUrl(existing.token) };
  }

  const token = generateInvitationToken();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      company_id: companyId,
      token,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };

  updateTag(`renta:invitation:${companyId}`);
  return { ok: true, invitation: data as RentaInvitation, url: buildPublicUrl(data.token) };
}

export async function revokeRentaInvitation(
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = createAdminClient().schema("renta");
  const { error } = await supabase
    .from("invitations")
    .update({ status: "revocada", revoked_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("status", "activa");
  if (error) return { ok: false, error: error.message };
  updateTag(`renta:invitation:${companyId}`);
  return { ok: true };
}

function buildPublicUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.leanfinance.es";
  return `${base.replace(/\/$/, "")}/renta/${token}`;
}

// ===========================================================================
// Email de invitación (invoca edge function)
// ===========================================================================

export async function sendRentaInvitationEmail(
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  await assertCompanyHasRentaService(companyId);

  const inv = await getActiveInvitation(companyId);
  if (!inv) return { ok: false, error: "Genera primero un enlace activo." };

  // Comprobar que hay autorizados.
  const supabase = createAdminClient();
  const { count: filersCount } = await supabase
    .schema("renta")
    .from("authorized_filers")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if ((filersCount ?? 0) === 0) {
    return {
      ok: false,
      error: "Añade al menos un DNI autorizado antes de enviar el enlace.",
    };
  }

  // Cuentas asociadas (perfiles cliente de la empresa).
  const { data: profileCompanies } = await supabase
    .from("profile_companies")
    .select("profile_id")
    .eq("company_id", companyId);
  const profileIds = (profileCompanies ?? []).map((r) => r.profile_id);
  if (profileIds.length === 0) {
    return { ok: false, error: "La empresa no tiene cuentas asociadas a las que enviar el email." };
  }

  // Invocar edge function.
  const fnName = "notify-renta-invitation";
  const { error } = await supabase.functions.invoke(fnName, {
    body: { company_id: companyId, sent_by_id: user.id, to_profile_ids: profileIds },
  });
  if (error) return { ok: false, error: error.message ?? "Error invocando email." };
  return { ok: true };
}

// ===========================================================================
// Submissions (lectura admin + estado)
// ===========================================================================

export async function listSubmissions(companyId: string): Promise<RentaSubmission[]> {
  await requireAdmin();
  const supabase = createAdminClient().schema("renta");
  const { data } = await supabase
    .from("submissions")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return (data as RentaSubmission[]) ?? [];
}

export async function setSubmissionStatus(
  submissionId: string,
  status: RentaSubmissionStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  const supabase = createAdminClient().schema("renta");

  const update: Record<string, unknown> = { status };
  if (status === "revisada") {
    update.reviewed_by = user.id;
    update.reviewed_at = new Date().toISOString();
  } else {
    update.reviewed_by = null;
    update.reviewed_at = null;
  }

  const { data, error } = await supabase
    .from("submissions")
    .update(update)
    .eq("id", submissionId)
    .select("company_id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (data?.company_id) updateTag(`renta:submissions:${data.company_id}`);
  return { ok: true };
}

export async function updateSubmissionNotes(
  submissionId: string,
  notes: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = createAdminClient().schema("renta");
  const { data, error } = await supabase
    .from("submissions")
    .update({ admin_notes: notes })
    .eq("id", submissionId)
    .select("company_id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (data?.company_id) updateTag(`renta:submissions:${data.company_id}`);
  return { ok: true };
}
