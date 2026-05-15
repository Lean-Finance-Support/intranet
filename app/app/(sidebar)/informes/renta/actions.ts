"use server";

import { requireClient } from "@/lib/require-client";
import { createAdminClient } from "@/lib/supabase/server";
import { SERVICE_SLUGS } from "@/lib/types/services";
import type {
  RentaAuthorizedFiler,
  RentaSubmissionStatus,
} from "@/lib/types/renta";

/**
 * Verifica que el usuario logueado:
 *   1. Está vinculado a `companyId` vía `profile_companies` (lo asegura
 *      `requireClient()` al exigir que sea su empresa activa).
 *   2. La empresa tiene contratado el servicio `declaracion-renta`.
 *
 * Si algo falla, lanza error → la página debe envolver en try/catch para
 * `notFound()` y no exponer si la empresa existe o no.
 */
async function assertClientCanSeeRenta(companyId: string): Promise<void> {
  const { companyId: activeCompanyId } = await requireClient();
  if (activeCompanyId !== companyId) {
    throw new Error("forbidden");
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("company_services")
    .select("services!inner(slug)")
    .eq("company_id", companyId)
    .eq("services.slug", SERVICE_SLUGS.DECLARACION_RENTA)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("forbidden");
}

function buildPublicUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.leanfinance.es";
  return `${base.replace(/\/$/, "")}/renta/${token}`;
}

// ---------------------------------------------------------------------------
// Resumen agregado para el cliente. NO incluye `revokedCount` para no exponer
// histórico borrado a la vista del cliente.
// ---------------------------------------------------------------------------
export interface ClientRentaSummary {
  filersCount: number;
  pendingCount: number;
  reviewedCount: number;
  hasActiveInvitation: boolean;
  invitationUrl: string | null;
  invitationExpiresAt: string | null;
}

export async function getClientRentaSummary(
  companyId: string,
): Promise<ClientRentaSummary> {
  await assertClientCanSeeRenta(companyId);
  const renta = createAdminClient().schema("renta");

  const [filersRes, submissionsRes, invitationRes] = await Promise.all([
    renta
      .from("authorized_filers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    renta
      .from("submissions")
      .select("status, revoked_at")
      .eq("company_id", companyId)
      .is("revoked_at", null),
    renta
      .from("invitations")
      .select("token, expires_at")
      .eq("company_id", companyId)
      .eq("status", "activa")
      .maybeSingle(),
  ]);

  const submissions = (submissionsRes.data ?? []) as {
    status: RentaSubmissionStatus;
  }[];

  let pendingCount = 0;
  let reviewedCount = 0;
  for (const s of submissions) {
    if (s.status === "revisada") reviewedCount += 1;
    else pendingCount += 1;
  }

  const invitation = invitationRes.data as
    | { token: string; expires_at: string }
    | null;

  return {
    filersCount: filersRes.count ?? 0,
    pendingCount,
    reviewedCount,
    hasActiveInvitation: invitation != null,
    invitationUrl: invitation ? buildPublicUrl(invitation.token) : null,
    invitationExpiresAt: invitation?.expires_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Submissions seguras para el cliente: metadatos + las deducciones que el
// asesor ha confirmado (solo cuando la submission está 'revisada'). NUNCA
// exponemos profile_response, deductions_response, uncertain_deductions ni
// admin_notes (eso es privado entre el familiar y el asesor).
// ---------------------------------------------------------------------------
export interface ClientRentaDeduction {
  id: string;
  title: string;
  what_covers: string | null;
  requirements: string[];
  legal_reference: string | null;
}

export interface ClientRentaSubmissionMeta {
  id: string;
  full_name: string;
  dni: string;
  status: RentaSubmissionStatus;
  created_at: string;
  reviewed_at: string | null;
  /**
   * Deducciones confirmadas por el asesor. Solo se rellena cuando la
   * submission está 'revisada' — mientras esté pendiente va vacío.
   */
  confirmed_deductions: ClientRentaDeduction[];
}

export async function getClientRentaSubmissions(
  companyId: string,
): Promise<ClientRentaSubmissionMeta[]> {
  await assertClientCanSeeRenta(companyId);
  const renta = createAdminClient().schema("renta");
  const { data } = await renta
    .from("submissions")
    .select("id, full_name, dni, status, created_at, reviewed_at, confirmed_deductions")
    .eq("company_id", companyId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as {
    id: string;
    full_name: string;
    dni: string;
    status: RentaSubmissionStatus;
    created_at: string;
    reviewed_at: string | null;
    confirmed_deductions: string[] | null;
  }[];

  // Resolvemos los detalles de las deducciones confirmadas solo para las
  // submissions revisadas (las pendientes no exponen nada de deducciones).
  const idsToResolve = new Set<string>();
  for (const r of rows) {
    if (r.status === "revisada") {
      for (const id of r.confirmed_deductions ?? []) idsToResolve.add(id);
    }
  }
  const deductionById = new Map<string, ClientRentaDeduction>();
  if (idsToResolve.size > 0) {
    const { data: deductions } = await renta
      .from("deductions")
      .select("id, title, what_covers, requirements, legal_reference")
      .in("id", [...idsToResolve]);
    for (const d of deductions ?? []) {
      deductionById.set(d.id as string, {
        id: d.id as string,
        title: d.title as string,
        what_covers: (d.what_covers as string | null) ?? null,
        requirements: (d.requirements as string[] | null) ?? [],
        legal_reference: (d.legal_reference as string | null) ?? null,
      });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    dni: r.dni,
    status: r.status,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    confirmed_deductions:
      r.status === "revisada"
        ? (r.confirmed_deductions ?? [])
            .map((id) => deductionById.get(id))
            .filter((d): d is ClientRentaDeduction => d != null)
        : [],
  }));
}

// ---------------------------------------------------------------------------
// Invitation activa: devuelve solo URL + expiración (NO el token raw, aunque
// vaya ya embebido en la URL pública — el filer la usa con ese formato).
// ---------------------------------------------------------------------------
export interface ClientActiveInvitation {
  url: string;
  expires_at: string;
}

export async function getClientActiveInvitationUrl(
  companyId: string,
): Promise<ClientActiveInvitation | null> {
  await assertClientCanSeeRenta(companyId);
  const renta = createAdminClient().schema("renta");
  const { data } = await renta
    .from("invitations")
    .select("token, expires_at")
    .eq("company_id", companyId)
    .eq("status", "activa")
    .maybeSingle();
  if (!data) return null;
  return {
    url: buildPublicUrl(data.token),
    expires_at: data.expires_at,
  };
}

// ---------------------------------------------------------------------------
// DNIs autorizados (read-only desde la perspectiva del cliente).
// ---------------------------------------------------------------------------
export interface ClientAuthorizedFilerView {
  id: string;
  dni: string;
  full_name: string;
  email: string | null;
  has_submission: boolean;
}

export async function listClientAuthorizedFilers(
  companyId: string,
): Promise<ClientAuthorizedFilerView[]> {
  await assertClientCanSeeRenta(companyId);
  const renta = createAdminClient().schema("renta");

  const [filersRes, submissionsRes] = await Promise.all([
    renta
      .from("authorized_filers")
      .select("id, dni, full_name, email")
      .eq("company_id", companyId)
      .order("created_at"),
    renta
      .from("submissions")
      .select("authorized_filer_id")
      .eq("company_id", companyId)
      .is("revoked_at", null),
  ]);

  const submittedIds = new Set(
    (submissionsRes.data ?? []).map(
      (r: { authorized_filer_id: string }) => r.authorized_filer_id,
    ),
  );

  const rows = (filersRes.data ?? []) as Pick<
    RentaAuthorizedFiler,
    "id" | "dni" | "full_name" | "email"
  >[];

  return rows.map((f) => ({
    id: f.id,
    dni: f.dni,
    full_name: f.full_name,
    email: f.email,
    has_submission: submittedIds.has(f.id),
  }));
}
