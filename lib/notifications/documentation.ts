// Helper para crear/actualizar notificaciones in-app de documentación.
//
// Modelo: una sola notificación viva por (recipient, company, kind='documentation')
// que se va actualizando con el último evento mientras esté no leída. Cuando la
// marcan como leída se "cierra" — la siguiente acción genera una nueva.
//
// Ver supabase/migrations/20260430170000_documentation_notifications.sql:
// función public.upsert_doc_notification.

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

const KIND = "documentation";

interface NotifyArgs {
  /** id del client_apartado afectado (para resolver supervisores) */
  clientApartadoId: string;
  /** id del usuario que dispara la acción — se excluye de los destinatarios */
  actorId: string;
  /** Resumen corto en presente: "ha subido un archivo en X", "ha rechazado X". */
  summary: string;
}

/**
 * Notifica a los supervisores del apartado (excluyendo al propio actor).
 * Usado para acciones del cliente que tienen que llegar a los supervisores.
 */
export async function notifyDocumentationSupervisors({
  clientApartadoId,
  actorId,
  summary,
}: NotifyArgs): Promise<void> {
  const admin = createAdminClient();

  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("client_block_id")
    .eq("id", clientApartadoId)
    .single();
  if (!ca) return;

  const { data: cb } = await admin
    .schema("documentation")
    .from("client_blocks")
    .select("company_id")
    .eq("id", ca.client_block_id as string)
    .single();
  if (!cb) return;
  const companyId = cb.company_id as string;

  const [{ data: supervisors }, { data: company }] = await Promise.all([
    admin
      .schema("documentation")
      .from("apartado_supervisors_v")
      .select("profile_id")
      .eq("client_apartado_id", clientApartadoId),
    admin
      .from("companies")
      .select("legal_name, company_name")
      .eq("id", companyId)
      .single(),
  ]);

  const recipients = Array.from(
    new Set(
      (supervisors ?? [])
        .map((s) => s.profile_id as string)
        .filter((id) => id !== actorId)
    )
  );
  if (recipients.length === 0) return;

  const companyLabel =
    (company?.company_name as string | null) ??
    (company?.legal_name as string | null) ??
    "cliente";
  const title = `Documentación · ${companyLabel}`;
  const link = `/clientes/${companyId}?tab=documentacion`;

  await Promise.all(
    recipients.map((rid) =>
      admin.rpc("upsert_doc_notification", {
        p_recipient_id: rid,
        p_company_id: companyId,
        p_kind: KIND,
        p_title: title,
        p_summary: summary,
        p_link: link,
      })
    )
  );
}

/**
 * Notifica a los usuarios cliente de la empresa (excluyendo al propio actor).
 * Usado para acciones del admin/supervisor que tienen que llegar al cliente.
 */
export async function notifyDocumentationClients({
  clientApartadoId,
  actorId,
  summary,
}: NotifyArgs): Promise<void> {
  const admin = createAdminClient();

  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("client_block_id")
    .eq("id", clientApartadoId)
    .single();
  if (!ca) return;

  const { data: cb } = await admin
    .schema("documentation")
    .from("client_blocks")
    .select("company_id")
    .eq("id", ca.client_block_id as string)
    .single();
  if (!cb) return;
  const companyId = cb.company_id as string;

  const { data: links } = await admin
    .from("profile_companies")
    .select("profile_id")
    .eq("company_id", companyId);

  const recipients = Array.from(
    new Set(
      (links ?? [])
        .map((l) => l.profile_id as string)
        .filter((id) => id !== actorId)
    )
  );
  if (recipients.length === 0) return;

  const title = "Documentación · novedades de tu asesor";
  const link = `/set-company?companyId=${companyId}&next=${encodeURIComponent("/empresa")}`;

  await Promise.all(
    recipients.map((rid) =>
      admin.rpc("upsert_doc_notification", {
        p_recipient_id: rid,
        p_company_id: companyId,
        p_kind: KIND,
        p_title: title,
        p_summary: summary,
        p_link: link,
      })
    )
  );
}

// ─── Helpers de etiquetado ─────────────────────────────────────────────

/** Construye el resumen "Pepe ha subido un archivo en «Modelo 200»". */
export function buildSummary(
  actorName: string | null,
  actorEmail: string,
  action: string,
  apartadoName: string
): string {
  const name = actorName?.trim() || actorEmail;
  return `${name} ${action} en «${apartadoName}»`;
}

/**
 * Carga nombre/email del actor + nombre del apartado en una sola llamada.
 * Útil para los server actions cuando van a invocar buildSummary.
 */
export async function getActorAndApartadoLabel(
  actorId: string,
  clientApartadoId: string
): Promise<{ actorName: string | null; actorEmail: string; apartadoName: string }> {
  const admin = createAdminClient();
  const [{ data: profile }, { data: ca }] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", actorId).single(),
    admin
      .schema("documentation")
      .from("client_apartados")
      .select("apartado:apartados(name)")
      .eq("id", clientApartadoId)
      .single(),
  ]);
  const apartado = ca?.apartado as unknown as { name: string } | null;
  return {
    actorName: (profile?.full_name as string | null) ?? null,
    actorEmail: (profile?.email as string) ?? "",
    apartadoName: apartado?.name ?? "un apartado",
  };
}
