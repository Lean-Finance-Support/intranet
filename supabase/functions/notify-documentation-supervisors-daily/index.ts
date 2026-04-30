// Recordatorio diario a supervisores con apartados pendientes de revisar.
//
// Lo invoca pg_cron (ver migración 20260430170000_documentation_notifications.sql)
// a las 07:00 UTC L-V. Recorre los apartados en estado "enviado", agrupa por
// supervisor y manda un único email a cada uno con el listado de apartados
// que tiene a la espera.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = "Lean Finance <noreply@leanfinance.es>";
const ADMIN_URL = "https://admin.leanfinance.es";

interface ApartadoToReview {
  clientApartadoId: string;
  companyId: string;
  companyName: string;
  apartadoName: string;
  blockName: string;
  sentAt: string | null;
}

Deno.serve(async (req: Request) => {
  const secret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // 1. Apartados en estado "enviado" (los que esperan revisión)
  const { data: apartados } = await supabase
    .schema("documentation")
    .from("client_apartados")
    .select("id, client_block_id, apartado_id, status")
    .eq("status", "enviado");

  if (!apartados || apartados.length === 0) {
    return jsonResponse({ sent: 0, reason: "no apartados to review" });
  }

  const clientApartadoIds = apartados.map((a) => a.id as string);
  const clientBlockIds = [...new Set(apartados.map((a) => a.client_block_id as string))];
  const apartadoIds = [...new Set(apartados.map((a) => a.apartado_id as string))];

  // 2. Resolver bloques → companies, y nombres del catálogo
  const [{ data: clientBlocks }, { data: catalogApartados }, { data: catalogBlocks }, { data: supervisors }, { data: history }] =
    await Promise.all([
      supabase
        .schema("documentation")
        .from("client_blocks")
        .select("id, company_id, block_id")
        .in("id", clientBlockIds),
      supabase
        .schema("documentation")
        .from("apartados")
        .select("id, name, block_id")
        .in("id", apartadoIds),
      supabase.schema("documentation").from("blocks").select("id, name"),
      supabase
        .schema("documentation")
        .from("apartado_supervisors_v")
        .select("client_apartado_id, profile_id, profile_email, profile_full_name")
        .in("client_apartado_id", clientApartadoIds),
      supabase
        .schema("documentation")
        .from("apartado_status_history")
        .select("client_apartado_id, to_status, changed_at")
        .in("client_apartado_id", clientApartadoIds)
        .eq("to_status", "enviado")
        .order("changed_at", { ascending: false }),
    ]);

  if (!supervisors || supervisors.length === 0) {
    return jsonResponse({ sent: 0, reason: "no supervisors assigned" });
  }

  const companyIds = [...new Set((clientBlocks ?? []).map((cb) => cb.company_id as string))];
  const { data: companies } = await supabase
    .from("companies")
    .select("id, legal_name, company_name")
    .in("id", companyIds);

  // 3. Construir índices auxiliares
  const blockById = new Map((clientBlocks ?? []).map((cb) => [cb.id as string, cb]));
  const catalogApartadoById = new Map(
    (catalogApartados ?? []).map((a) => [a.id as string, a])
  );
  const catalogBlockById = new Map(
    (catalogBlocks ?? []).map((b) => [b.id as string, b])
  );
  const companyById = new Map((companies ?? []).map((c) => [c.id as string, c]));

  // Última fecha de paso a "enviado" por client_apartado
  const lastSentAt = new Map<string, string>();
  for (const h of history ?? []) {
    const id = h.client_apartado_id as string;
    if (!lastSentAt.has(id)) lastSentAt.set(id, h.changed_at as string);
  }

  // 4. Construir lista de apartados a revisar con metadatos completos
  const enrichedById = new Map<string, ApartadoToReview>();
  for (const ca of apartados) {
    const cbRow = blockById.get(ca.client_block_id as string);
    const cat = catalogApartadoById.get(ca.apartado_id as string);
    if (!cbRow || !cat) continue;
    const company = companyById.get(cbRow.company_id as string);
    const catBlock = catalogBlockById.get((cat.block_id as string) ?? "");
    enrichedById.set(ca.id as string, {
      clientApartadoId: ca.id as string,
      companyId: cbRow.company_id as string,
      companyName:
        (company?.company_name as string | null) ??
        (company?.legal_name as string | null) ??
        "—",
      apartadoName: (cat.name as string) ?? "Apartado",
      blockName: (catBlock?.name as string | null) ?? "",
      sentAt: lastSentAt.get(ca.id as string) ?? null,
    });
  }

  // 5. Agrupar por supervisor
  interface SupervisorBucket {
    email: string;
    fullName: string | null;
    items: ApartadoToReview[];
  }
  const bySupervisor = new Map<string, SupervisorBucket>();
  for (const s of supervisors) {
    const item = enrichedById.get(s.client_apartado_id as string);
    if (!item) continue;
    const profileId = s.profile_id as string;
    const bucket = bySupervisor.get(profileId) ?? {
      email: (s.profile_email as string) ?? "",
      fullName: (s.profile_full_name as string | null) ?? null,
      items: [],
    };
    bucket.items.push(item);
    bySupervisor.set(profileId, bucket);
  }

  // 6. Enviar email por supervisor
  let sent = 0;
  const errors: string[] = [];

  for (const bucket of bySupervisor.values()) {
    if (!bucket.email || bucket.items.length === 0) continue;

    const subject =
      bucket.items.length === 1
        ? `Tienes 1 apartado pendiente de revisar`
        : `Tienes ${bucket.items.length} apartados pendientes de revisar`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: bucket.email,
        subject,
        html: buildHtml({ recipientName: bucket.fullName, items: bucket.items }),
        text: buildText({ recipientName: bucket.fullName, items: bucket.items }),
      }),
    });

    if (res.ok) {
      sent++;
    } else {
      const err = await res.text();
      errors.push(`${bucket.email}: ${err}`);
      console.error(`[notify-doc-daily] Resend error for ${bucket.email}:`, err);
    }
  }

  return jsonResponse({ sent, supervisors_with_pending: bySupervisor.size, errors });
});

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function buildHtml({
  recipientName,
  items,
}: {
  recipientName: string | null;
  items: ApartadoToReview[];
}): string {
  const greeting = recipientName ? `Hola, ${recipientName}` : "Hola";

  // Agrupar por empresa para que cada cliente sea una sub-tabla.
  const byCompany = new Map<string, { name: string; companyId: string; rows: ApartadoToReview[] }>();
  for (const it of items) {
    const cur = byCompany.get(it.companyId) ?? { name: it.companyName, companyId: it.companyId, rows: [] };
    cur.rows.push(it);
    byCompany.set(it.companyId, cur);
  }

  const sections = [...byCompany.values()]
    .map((c) => {
      const url = `${ADMIN_URL}/clientes/${c.companyId}?tab=documentacion`;
      const rows = c.rows
        .map((r) => {
          const days = daysSince(r.sentAt);
          const waiting =
            days === null
              ? ""
              : days === 0
              ? "hoy"
              : days === 1
              ? "1 día"
              : `${days} días`;
          return `
            <tr>
              <td style="padding:10px 16px;font-size:14px;color:#0f2444;border-bottom:1px solid #f3f4f6;">
                <strong>${escapeHtml(r.apartadoName)}</strong>
                ${r.blockName ? `<br/><span style="font-size:12px;color:#9ca3af;">${escapeHtml(r.blockName)}</span>` : ""}
              </td>
              <td style="padding:10px 16px;font-size:13px;color:#4b5563;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;">${waiting}</td>
            </tr>`;
        })
        .join("");
      return `
        <div style="margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0f2444;">${escapeHtml(c.name)}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tbody>${rows}</tbody>
          </table>
          <p style="margin:8px 0 0;font-size:13px;">
            <a href="${url}" style="color:#00B0B7;text-decoration:none;font-weight:600;">Abrir documentación de ${escapeHtml(c.name)} &rarr;</a>
          </p>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Apartados pendientes de revisar</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;" />
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Documentación &middot; recordatorio</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#0f2444;line-height:1.3;">${
            items.length === 1 ? "Tienes 1 apartado pendiente de revisar" : `Tienes ${items.length} apartados pendientes de revisar`
          }</h1>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">${greeting},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">Estos apartados están a la espera de que los valides o rechaces. Cuanto antes los revises, antes podrá avanzar el cliente.</p>
          ${sections}
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">Recibes este email porque eres supervisor de los apartados listados. Si crees que ya no deberías serlo, contacta con tu Chief.</p>
        </td></tr>
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Lean Finance &middot; Asesoría fiscal y contable</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildText({
  recipientName,
  items,
}: {
  recipientName: string | null;
  items: ApartadoToReview[];
}): string {
  const greeting = recipientName ? `Hola, ${recipientName}` : "Hola";
  const lines = items
    .map((r) => {
      const days = daysSince(r.sentAt);
      const waiting =
        days === null ? "" : days === 0 ? " (hoy)" : days === 1 ? " (1 día)" : ` (${days} días)`;
      return `  • ${r.companyName} — ${r.apartadoName}${waiting}`;
    })
    .join("\n");
  return `${greeting},\n\nTienes ${items.length} apartado${
    items.length === 1 ? "" : "s"
  } a la espera de revisión:\n\n${lines}\n\nAccede a admin.leanfinance.es para validar o rechazar.\n\n— Lean Finance`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
