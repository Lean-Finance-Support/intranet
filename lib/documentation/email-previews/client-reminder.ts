// Builder del HTML del email "Avisar / Recordar al cliente" para la vista
// previa en hover en el portal admin. Mantener byte a byte sincronizado con
// `supabase/functions/notify-documentation-client-reminder/index.ts`
// (funciones `buildHtml`, `buildText` y `subject`). Esta copia se usa SOLO
// para el preview; el envío real lo hace la edge function.

const APP_URL = "https://app.leanfinance.es";

export type ClientReminderApartadoStatus =
  | "pendiente"
  | "enviado"
  | "validado"
  | "rechazado";

export interface ClientReminderApartadoRow {
  id: string;
  name: string;
  description: string | null;
  status: ClientReminderApartadoStatus;
  rejectionReason: string | null;
  blockName: string;
}

export interface ClientReminderPreviewContext {
  companyId: string;
  companyName: string;
  recipientName: string | null;
  senderName: string;
  comment: string | null;
  rejected: ClientReminderApartadoRow[];
  pending: ClientReminderApartadoRow[];
  inReview: ClientReminderApartadoRow[];
  validated: ClientReminderApartadoRow[];
}

export function buildClientReminderPreviewSubject(
  ctx: Pick<ClientReminderPreviewContext, "companyName" | "rejected" | "pending">
): string {
  const { rejected, pending, companyName } = ctx;
  return rejected.length > 0 && pending.length > 0
    ? `Tienes documentación pendiente y rechazada — ${companyName}`
    : rejected.length > 0
    ? `Tienes documentación rechazada — ${companyName}`
    : `Tienes documentación pendiente — ${companyName}`;
}

export function buildClientReminderPreviewHtml(p: ClientReminderPreviewContext): string {
  const greeting = p.recipientName ? `Hola, ${p.recipientName}` : "Hola";
  const docUrl = `${APP_URL}/set-company?companyId=${p.companyId}&next=${encodeURIComponent("/empresa")}`;

  const detailedSection = (
    title: string,
    color: string,
    rows: ClientReminderApartadoRow[],
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

  const briefSection = (title: string, rows: ClientReminderApartadoRow[]): string => {
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

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
