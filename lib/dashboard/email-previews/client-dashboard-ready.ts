// Builder del HTML del email "Tu dashboard fiscal está listo" para la vista
// previa en hover del panel admin de Dashboard. Mantener byte a byte
// sincronizado con `supabase/functions/notify-client-dashboard-ready/index.ts`
// (`buildHtml`, `subject`). Esta copia se usa SOLO para el preview; el envío
// real lo hace la edge function.

export interface ClientDashboardReadyPreviewContext {
  companyName: string;
  recipientNames: string[];
  portalUrl: string;
}

export function buildClientDashboardReadyPreviewSubject(
  ctx: Pick<ClientDashboardReadyPreviewContext, "companyName">
): string {
  return `Tu dashboard fiscal está listo — ${ctx.companyName}`;
}

export function buildClientDashboardReadyPreviewHtml(
  ctx: ClientDashboardReadyPreviewContext
): string {
  const greetingNames = joinNames(ctx.recipientNames);
  const greeting = greetingNames ? `Hola ${escapeHtml(greetingNames)},` : "Hola,";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tu dashboard fiscal está listo</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;" />
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Novedad</p>
          <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#0f2444;line-height:1.3;">Tu dashboard fiscal ya está disponible</h1>

          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">Hemos activado el <strong>dashboard fiscal</strong> de <strong>${escapeHtml(ctx.companyName)}</strong> en el portal. A partir de ahora podéis consultar en cualquier momento la situación de ventas, compras y bancos, además de las facturas pendientes o vencidas.</p>

          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">El dashboard se actualiza diariamente con los datos que mantenemos al día desde el equipo de Lean Finance.</p>

          <table cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">
            <tr>
              <td style="background-color:#00B0B7;border-radius:8px;">
                <a href="${ctx.portalUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Ver mi dashboard</a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">Si tenéis cualquier duda sobre las cifras o queréis profundizar en algún apartado, escribidnos y os ayudamos encantados.</p>

          <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el botón no funciona, copia y pega este enlace:<br/><a href="${ctx.portalUrl}" style="color:#00B0B7;word-break:break-all;">${ctx.portalUrl}</a></p>
        </td></tr>
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Lean Finance &middot; Asesoría fiscal y contable<br/>Este correo se ha enviado a los contactos de <strong>${escapeHtml(ctx.companyName)}</strong>.</p>
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

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}
