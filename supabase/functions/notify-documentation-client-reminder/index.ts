// Email "recordar al cliente" — invocado manualmente desde el portal admin
// cuando un supervisor o chief pulsa el botón en la ficha de cliente.
//
// Manda un email a todos los usuarios cliente vinculados a la empresa con
// el estado de su documentación: detalle de apartados rechazados (motivo) y
// pendientes (descripción), y resumen escueto de los validados / en revisión.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = "Lean Finance <noreply@leanfinance.es>";
const APP_URL = "https://app.leanfinance.es";

type ApartadoStatus = "pendiente" | "enviado" | "validado" | "rechazado";

interface ApartadoRow {
  id: string;
  name: string;
  description: string | null;
  status: ApartadoStatus;
  rejectionReason: string | null;
  blockName: string;
}

// Invocada desde un server action con admin client; verify_jwt=false en
// config.toml. La URL no se expone al frontend.
Deno.serve(async (req: Request) => {
  let payload: { company_id: string; sent_by_id: string; comment?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!payload.company_id || !payload.sent_by_id) {
    return new Response("Missing fields", { status: 400 });
  }
  const comment =
    typeof payload.comment === "string" && payload.comment.trim()
      ? payload.comment.trim()
      : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // 1. Empresa
  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", payload.company_id)
    .single();

  if (!company) return jsonResponse({ sent: 0, reason: "company not found" });
  const companyName =
    (company.company_name as string | null) ?? (company.legal_name as string) ?? "";

  // 2. Destinatarios (perfiles cliente vinculados)
  const { data: links } = await supabase
    .from("profile_companies")
    .select("profile:profiles(id, email, full_name)")
    .eq("company_id", payload.company_id);

  if (!links || links.length === 0) {
    return jsonResponse({ sent: 0, reason: "no contacts" });
  }

  // 3. Quién envía el recordatorio (firma del email)
  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", payload.sent_by_id)
    .single();
  const senderName =
    (senderProfile?.full_name as string | null) ??
    (senderProfile?.email as string | null) ??
    "tu asesor";

  // 4. Estado de la documentación. Solo apartados no opcionales.
  const { data: clientBlocks } = await supabase
    .schema("documentation")
    .from("client_blocks")
    .select("id, block_id")
    .eq("company_id", payload.company_id);

  const clientBlockIds = (clientBlocks ?? []).map((cb) => cb.id as string);
  if (clientBlockIds.length === 0) {
    return jsonResponse({ sent: 0, reason: "no client blocks" });
  }

  const { data: clientApartados } = await supabase
    .schema("documentation")
    .from("client_apartados")
    .select("id, client_block_id, apartado_id, status, is_optional, last_rejection_reason")
    .in("client_block_id", clientBlockIds);

  const apartadoCatalogIds = [
    ...new Set((clientApartados ?? []).map((ca) => ca.apartado_id as string)),
  ];
  const blockCatalogIds = [
    ...new Set((clientBlocks ?? []).map((cb) => cb.block_id as string)),
  ];

  const [{ data: catalogApartados }, { data: catalogBlocks }] = await Promise.all([
    supabase
      .schema("documentation")
      .from("apartados")
      .select("id, name, description, block_id")
      .in("id", apartadoCatalogIds),
    supabase
      .schema("documentation")
      .from("blocks")
      .select("id, name")
      .in("id", blockCatalogIds),
  ]);

  const aptCatById = new Map((catalogApartados ?? []).map((a) => [a.id as string, a]));
  const blkCatById = new Map((catalogBlocks ?? []).map((b) => [b.id as string, b]));
  const cbById = new Map((clientBlocks ?? []).map((cb) => [cb.id as string, cb]));

  const allRows: ApartadoRow[] = [];
  for (const ca of clientApartados ?? []) {
    if (ca.is_optional) continue;
    const cat = aptCatById.get(ca.apartado_id as string);
    if (!cat) continue;
    const cb = cbById.get(ca.client_block_id as string);
    const blk = cb ? blkCatById.get(cb.block_id as string) : null;
    allRows.push({
      id: ca.id as string,
      name: (cat.name as string) ?? "Apartado",
      description: (cat.description as string | null) ?? null,
      status: ca.status as ApartadoStatus,
      rejectionReason: (ca.last_rejection_reason as string | null) ?? null,
      blockName: (blk?.name as string | null) ?? "",
    });
  }

  const rejected = allRows.filter((r) => r.status === "rechazado");
  const pending = allRows.filter((r) => r.status === "pendiente");
  const inReview = allRows.filter((r) => r.status === "enviado");
  const validated = allRows.filter((r) => r.status === "validado");

  if (rejected.length === 0 && pending.length === 0) {
    return jsonResponse({ sent: 0, reason: "nothing pending" });
  }

  const subject =
    rejected.length > 0 && pending.length > 0
      ? `Tienes documentación pendiente y rechazada — ${companyName}`
      : rejected.length > 0
      ? `Tienes documentación rechazada — ${companyName}`
      : `Tienes documentación pendiente — ${companyName}`;

  let sent = 0;
  const errors: string[] = [];

  for (const link of links) {
    const profile = link.profile as
      | { id: string; email: string; full_name: string | null }
      | null;
    if (!profile?.email) continue;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: profile.email,
        subject,
        html: buildHtml({
          companyId: payload.company_id,
          companyName,
          recipientName: profile.full_name,
          senderName,
          rejected,
          pending,
          inReview,
          validated,
          comment,
        }),
        text: buildText({
          companyName,
          recipientName: profile.full_name,
          senderName,
          rejected,
          pending,
          inReview,
          validated,
          comment,
        }),
      }),
    });
    if (res.ok) {
      sent++;
    } else {
      const err = await res.text();
      errors.push(`${profile.email}: ${err}`);
      console.error(`[notify-doc-client] Resend error for ${profile.email}:`, err);
    }
  }

  return jsonResponse({ sent, errors });
});

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

interface HtmlParams {
  companyId: string;
  companyName: string;
  recipientName: string | null;
  senderName: string;
  rejected: ApartadoRow[];
  pending: ApartadoRow[];
  inReview: ApartadoRow[];
  validated: ApartadoRow[];
  comment: string | null;
}

function buildHtml(p: HtmlParams): string {
  const greeting = p.recipientName ? `Hola, ${p.recipientName}` : "Hola";
  const docUrl = `${APP_URL}/set-company?companyId=${p.companyId}&next=${encodeURIComponent("/empresa")}`;

  const detailedSection = (
    title: string,
    color: string,
    rows: ApartadoRow[],
    showReason: boolean
  ): string => {
    if (rows.length === 0) return "";
    const items = rows
      .map((r) => {
        const desc = showReason && r.rejectionReason
          ? `<div style="margin-top:6px;padding:8px 10px;background:#fef2f2;border-left:3px solid #dc2626;font-size:13px;color:#991b1b;border-radius:4px;"><strong>Motivo:</strong> ${escapeHtml(r.rejectionReason)}</div>`
          : "";
        const description = r.description
          ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">${escapeHtml(r.description)}</p>`
          : "";
        return `
          <div style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#0f2444;">${escapeHtml(r.name)}</p>
            ${r.blockName ? `<p style="margin:2px 0 0;font-size:12px;color:#9ca3af;">${escapeHtml(r.blockName)}</p>` : ""}
            ${description}
            ${desc}
          </div>`;
      })
      .join("");
    return `
      <div style="margin-bottom:28px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${color};">${title} &middot; ${rows.length}</p>
        <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${items}</div>
      </div>`;
  };

  const briefSection = (title: string, rows: ApartadoRow[]): string => {
    if (rows.length === 0) return "";
    const items = rows
      .map(
        (r) =>
          `<li style="margin:0 0 4px;font-size:13px;color:#4b5563;">${escapeHtml(r.name)}${
            r.blockName ? ` <span style="color:#9ca3af;">· ${escapeHtml(r.blockName)}</span>` : ""
          }</li>`
      )
      .join("");
    return `
      <div style="margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">${title} &middot; ${rows.length}</p>
        <ul style="margin:0;padding-left:20px;">${items}</ul>
      </div>`;
  };

  const totalPending = p.rejected.length + p.pending.length;

  // Bloque de comentario opcional. Va después de la frase introductoria y antes
  // de las secciones detalladas. Respetamos saltos de línea del comentario.
  const commentBlock = p.comment
    ? `
          <p style="margin:0 0 12px;font-size:15px;color:#4b5563;line-height:1.6;">y además te deja el siguiente comentario:</p>
          <div style="margin:0 0 28px;padding:14px 16px;background:#f0fdfd;border:1px solid #00B0B7;border-radius:8px;">
            <p style="margin:0;font-size:14px;color:#1f2937;line-height:1.6;white-space:pre-wrap;">${escapeHtml(p.comment).replaceAll("\n", "<br/>")}</p>
          </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Documentación pendiente — ${escapeHtml(p.companyName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;" />
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Documentación</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#0f2444;line-height:1.3;">Tienes ${totalPending} apartado${totalPending === 1 ? "" : "s"} por completar</h1>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">${greeting},</p>
          <p style="margin:0 0 ${p.comment ? "12" : "24"}px;font-size:15px;color:#4b5563;line-height:1.6;"><strong>${escapeHtml(p.senderName)}</strong> te recuerda que aún quedan apartados por completar en la documentación de <strong>${escapeHtml(p.companyName)}</strong>.</p>
          ${commentBlock}
          ${detailedSection("Rechazados — corrige y vuelve a enviar", "#dc2626", p.rejected, true)}
          ${detailedSection("Pendientes de subir", "#d97706", p.pending, false)}
          ${briefSection("En revisión por tu asesor", p.inReview)}
          ${briefSection("Ya validados", p.validated)}

          <table cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
            <tr>
              <td style="background-color:#00B0B7;border-radius:8px;">
                <a href="${docUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Ir a mi documentación</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el botón no funciona, copia y pega este enlace:<br/><a href="${docUrl}" style="color:#00B0B7;word-break:break-all;">${docUrl}</a></p>
        </td></tr>
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Lean Finance &middot; Asesoría fiscal y contable<br/>Este correo se ha enviado a los contactos de <strong>${escapeHtml(p.companyName)}</strong>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildText(p: Omit<HtmlParams, "companyId">): string {
  const greeting = p.recipientName ? `Hola, ${p.recipientName}` : "Hola";
  const list = (title: string, rows: ApartadoRow[], detail = false) => {
    if (rows.length === 0) return "";
    const items = rows
      .map((r) => {
        let line = `  • ${r.name}`;
        if (detail && r.rejectionReason) line += `\n    Motivo: ${r.rejectionReason}`;
        return line;
      })
      .join("\n");
    return `\n${title} (${rows.length}):\n${items}\n`;
  };
  const commentBlock = p.comment
    ? `\n\ny además te deja el siguiente comentario:\n${p.comment}\n`
    : "";
  return `${greeting},\n\n${p.senderName} te recuerda que aún quedan apartados por completar en la documentación de ${p.companyName}.${commentBlock}\n${list(
    "Rechazados",
    p.rejected,
    true
  )}${list("Pendientes", p.pending)}${list("En revisión", p.inReview)}${list(
    "Validados",
    p.validated
  )}\nAccede a app.leanfinance.es para subirla.\n\n— Lean Finance`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
