// Builder del HTML del email "Dashboard Holded + Contrato" para la vista
// previa en hover en el portal admin. Mantener byte a byte sincronizado con
// `supabase/functions/notify-documentation-template-email/index.ts`
// (`buildDashboardHoldedContratoHtml`, subject de la entrada `dashboard-holded-contrato`
// en `TEMPLATES`). Esta copia se usa SOLO para el preview; el envío real lo
// hace la edge function.

export interface DashboardHoldedContratoPreviewContext {
  companyName: string;
  recipientName: string | null;
  apartadoUrl: string;
  // Base pública del bucket `email-assets` (mismo formato que la edge function:
  // `${SUPABASE_URL}/storage/v1/object/public/email-assets`).
  emailAssetsBase: string;
}

export function buildDashboardHoldedContratoPreviewSubject(
  ctx: Pick<DashboardHoldedContratoPreviewContext, "companyName">
): string {
  return `Nuevo Dashboard Lean Finance — Firma del Contrato de Tratamiento de Datos (${ctx.companyName})`;
}

export function buildDashboardHoldedContratoPreviewHtml(
  ctx: DashboardHoldedContratoPreviewContext
): string {
  const greeting = ctx.recipientName ? `Hola, ${ctx.recipientName}` : "Hola";
  const dashboardImg = `${ctx.emailAssetsBase}/dashboard-anonimo.png`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nuevo Dashboard Lean Finance — Firma del Contrato de Tratamiento de Datos</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;" />
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Novedades</p>
          <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#0f2444;line-height:1.3;">Estrenamos Dashboard de Asesoría</h1>

          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">${greeting},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">Os escribimos con muy buenas noticias: hemos desarrollado una mejora del servicio para vuestra comodidad. Ahora podemos ofreceros la información de <strong>facturación, compras y movimientos bancarios</strong> actualizada en un Dashboard centralizado.</p>

          <div style="margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <img src="${dashboardImg}" alt="Dashboard Asesoría Lean Finance" width="520" style="display:block;width:100%;height:auto;" />
          </div>

          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">Volcamos vuestra información de <strong>Holded</strong> vía API, para que podáis visualizar con comodidad todos los movimientos pendientes de conciliar: facturas de venta, facturas de compra y bancos. Creemos que os será de gran utilidad en la gestión diaria.</p>

          <!-- Bloque destacado: Contrato de Tratamiento de Datos -->
          <div style="margin:32px 0 24px;padding:24px 24px 20px;background:linear-gradient(135deg,#0f2444 0%,#16335a 100%);border-radius:12px;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#7DDCDF;">Acción requerida</p>
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#ffffff;line-height:1.3;">Firma el Contrato de Tratamiento de Datos</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#cfd8e3;line-height:1.6;">Para activar el volcado y empezar a recibir el Dashboard, necesitamos vuestra aprobación firmando el nuevo <strong style="color:#ffffff;">Contrato de Tratamiento de Datos</strong>. Lo encontraréis disponible en vuestro portal, dentro de la sección <strong style="color:#ffffff;">Mi empresa</strong>, en el apartado de <strong style="color:#ffffff;">Documentación</strong>.</p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:#00B0B7;border-radius:8px;">
                  <a href="${ctx.apartadoUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Firmar el contrato</a>
                </td>
              </tr>
            </table>
          </div>

          <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el botón no funciona, copia y pega este enlace:<br/><a href="${ctx.apartadoUrl}" style="color:#00B0B7;word-break:break-all;">${ctx.apartadoUrl}</a></p>
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
