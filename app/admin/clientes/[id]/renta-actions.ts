"use server";

import { updateTag } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { invalidateNotifications } from "@/lib/actions/notifications";
import { generateInvitationToken } from "@/lib/renta/catalog";
import { normalizeDni, isValidDni } from "@/lib/renta/dni";
import { SERVICE_SLUGS } from "@/lib/types/services";
import type {
  RentaAuthorizedFiler,
  RentaAuthorizedFilerWithUsage,
  RentaDeduction,
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
      .eq("company_id", companyId)
      .is("revoked_at", null),
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
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return { ok: false, error: "WEBHOOK_SECRET no configurado en el servidor." };
  }
  const fnName = "notify-renta-invitation";
  const { data, error } = await supabase.functions.invoke(fnName, {
    body: { company_id: companyId, sent_by_id: user.id, to_profile_ids: profileIds },
    headers: { "x-webhook-secret": webhookSecret },
  });
  if (error) {
    console.error("[sendRentaInvitationEmail] invoke error:", error);
    return { ok: false, error: error.message ?? "Error invocando email." };
  }
  if (data && typeof data === "object" && "error" in data) {
    return { ok: false, error: String((data as { error: unknown }).error) };
  }

  // Notificación in-app a las cuentas asociadas a la empresa. Se hace tras el
  // envío exitoso del email para que el cliente reciba el aviso también dentro
  // del portal (badge en la campana). Wrappeamos en try/catch porque el email
  // ya se envió correctamente — un fallo aquí no debe propagarse.
  try {
    const rows = profileIds.map((profileId) => ({
      recipient_id: profileId,
      company_id: companyId,
      title: "Formulario de la renta disponible",
      message:
        "Tu asesor ha habilitado el formulario para calcular las deducciones autonómicas. Ábrelo desde aquí o compártelo con las personas vinculadas al servicio.",
      link: "/informes/renta",
    }));
    if (rows.length > 0) {
      const { error: notifError } = await supabase
        .from("notifications")
        .insert(rows);
      if (notifError) {
        console.error("[sendRentaInvitationEmail] notif insert error:", notifError);
      } else {
        await invalidateNotifications(profileIds);
      }
    }
  } catch (err) {
    console.error("[sendRentaInvitationEmail] notif fatal:", err);
  }

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

/**
 * Resumen agregado del estado del servicio "Declaración de la renta" para una
 * empresa: nº de DNIs autorizados, recuento de submissions por estado y si
 * existe un enlace público activo. Se usa en la tarjeta resumen del tab
 * "Informes / Formularios" para mostrar métricas de un vistazo sin cargar el
 * panel completo (que vive ahora en `/admin/clientes/[id]/renta`).
 */
export async function getRentaSummary(companyId: string): Promise<{
  filersCount: number;
  pendingCount: number;
  reviewedCount: number;
  revokedCount: number;
  hasActiveInvitation: boolean;
}> {
  await requireAdmin();
  const supabase = createAdminClient().schema("renta");

  const [filersRes, submissionsRes, invitationRes] = await Promise.all([
    supabase
      .from("authorized_filers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("submissions")
      .select("status, revoked_at")
      .eq("company_id", companyId),
    supabase
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "activa"),
  ]);

  const submissions = (submissionsRes.data ?? []) as {
    status: RentaSubmissionStatus;
    revoked_at: string | null;
  }[];

  let pendingCount = 0;
  let reviewedCount = 0;
  let revokedCount = 0;
  for (const s of submissions) {
    if (s.revoked_at != null) {
      revokedCount += 1;
    } else if (s.status === "revisada") {
      reviewedCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  return {
    filersCount: filersRes.count ?? 0,
    pendingCount,
    reviewedCount,
    revokedCount,
    hasActiveInvitation: (invitationRes.count ?? 0) > 0,
  };
}

/**
 * Devuelve el catálogo completo de deducciones (todas las CCAA, activas e inactivas).
 * Se usa en el panel admin para hacer lookup de id → title + extra_fields al
 * pintar las submissions: las deducciones pueden haberse desactivado o cambiado
 * pero seguir presentes en submissions antiguas.
 */
export async function getDeductionsCatalog(): Promise<RentaDeduction[]> {
  await requireAdmin();
  const supabase = createAdminClient().schema("renta");
  const { data } = await supabase
    .from("deductions")
    .select("*")
    .order("ccaa_code")
    .order("display_order");
  return (data as RentaDeduction[]) ?? [];
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

/**
 * Fija la lista de deducciones confirmadas por el asesor para una submission.
 * Es la lista definitiva que verá el cliente cuando la submission esté en
 * estado 'revisada'. El asesor la edita libremente: añade deducciones, quita
 * las que no apliquen y resuelve las marcadas "No estoy seguro".
 */
export async function setConfirmedDeductions(
  submissionId: string,
  deductionIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = createAdminClient().schema("renta");

  const clean = [
    ...new Set((deductionIds ?? []).filter((id) => typeof id === "string" && id.length > 0)),
  ];

  // Al cambiar la lista confirmada, podamos `confirmed_deductions_response`
  // para que no queden extra_fields huérfanos de deducciones ya retiradas.
  const { data: current } = await supabase
    .from("submissions")
    .select("confirmed_deductions_response")
    .eq("id", submissionId)
    .single();
  const cleanSet = new Set(clean);
  const prunedResponse: Record<string, unknown> = {};
  for (const [id, payload] of Object.entries(
    (current?.confirmed_deductions_response ?? {}) as Record<string, unknown>,
  )) {
    if (cleanSet.has(id)) prunedResponse[id] = payload;
  }

  const { data, error } = await supabase
    .from("submissions")
    .update({ confirmed_deductions: clean, confirmed_deductions_response: prunedResponse })
    .eq("id", submissionId)
    .select("company_id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (data?.company_id) updateTag(`renta:submissions:${data.company_id}`);
  return { ok: true };
}

/**
 * Guarda los extra_fields que el asesor ha rellenado/corregido para una
 * deducción confirmada concreta. Solo se permite mientras la submission no
 * esté en estado 'revisada' (los envíos revisados quedan bloqueados).
 */
export async function setConfirmedDeductionResponse(
  submissionId: string,
  deductionId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (!deductionId || typeof deductionId !== "string") {
    return { ok: false, error: "Deducción inválida." };
  }
  const supabase = createAdminClient().schema("renta");

  const { data: current, error: readErr } = await supabase
    .from("submissions")
    .select("status, confirmed_deductions, confirmed_deductions_response")
    .eq("id", submissionId)
    .single();
  if (readErr) return { ok: false, error: readErr.message };
  if (current.status === "revisada") {
    return { ok: false, error: "El envío está revisado: márcalo como pendiente para editarlo." };
  }
  if (!(current.confirmed_deductions ?? []).includes(deductionId)) {
    return { ok: false, error: "Esa deducción no está en la lista de confirmadas." };
  }

  const nextResponse = {
    ...((current.confirmed_deductions_response ?? {}) as Record<string, unknown>),
    [deductionId]: payload && typeof payload === "object" ? payload : {},
  };

  const { data, error } = await supabase
    .from("submissions")
    .update({ confirmed_deductions_response: nextResponse })
    .eq("id", submissionId)
    .select("company_id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (data?.company_id) updateTag(`renta:submissions:${data.company_id}`);
  return { ok: true };
}

/**
 * Revoca una submission para que el filer pueda volver a rellenar el formulario.
 * Soft-delete: la fila se conserva como histórico (revoked_at + revoked_by) y la
 * unique index parcial libera el slot para una nueva submission del mismo DNI.
 */
export async function revokeSubmission(
  submissionId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  const supabase = createAdminClient().schema("renta");
  const { data, error } = await supabase
    .from("submissions")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: user.id,
      revoke_reason: reason?.trim() || null,
    })
    .eq("id", submissionId)
    .is("revoked_at", null)
    .select("company_id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (data?.company_id) updateTag(`renta:submissions:${data.company_id}`);
  return { ok: true };
}
