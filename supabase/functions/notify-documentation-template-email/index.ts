// Email "asignación de apartado con plantilla asociada" — invocado desde el
// flujo de Asignación múltiple cuando un apartado del catálogo tiene
// `email_template_slug` y el admin marca la opción de envío.
//
// Recibe { company_id, client_apartado_id, template_slug, sent_by_id }.
// La plantilla se selecciona por slug; cada plantilla soportada vive como un
// builder en este mismo archivo. Añadir una plantilla = nueva entrada en
// TEMPLATES + el slug correspondiente en lib/documentation/email-templates.ts
// (cliente Next).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyWebhookSecret } from "../_shared/verify-webhook-secret.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = "Lean Finance <noreply@leanfinance.es>";
const APP_URL = "https://app.leanfinance.es";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
// Base de assets públicos para imágenes embebidas en emails (bucket
// `email-assets`, ver migración 20260504090053_email_assets_bucket.sql).
const EMAIL_ASSETS_BASE = `${SUPABASE_URL}/storage/v1/object/public/email-assets`;

interface BuildContext {
  companyId: string;
  companyName: string;
  recipientName: string | null;
  senderName: string;
  apartadoName: string;
  apartadoUrl: string;
}

interface TemplateBuilders {
  subject: (ctx: BuildContext) => string;
  html: (ctx: BuildContext) => string;
  text: (ctx: BuildContext) => string;
}

const TEMPLATES: Record<string, TemplateBuilders> = {
  "dashboard-holded-contrato": {
    subject: (ctx) =>
      `Nuevo Dashboard Lean Finance — Firma del Contrato de Tratamiento de Datos (${ctx.companyName})`,
    html: buildDashboardHoldedContratoHtml,
    text: buildDashboardHoldedContratoText,
  },
};

Deno.serve(async (req: Request) => {
  const unauthorized = verifyWebhookSecret(req);
  if (unauthorized) return unauthorized;

  let payload: {
    company_id: string;
    client_apartado_id: string;
    template_slug: string;
    sent_by_id: string;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (
    !payload.company_id ||
    !payload.client_apartado_id ||
    !payload.template_slug ||
    !payload.sent_by_id
  ) {
    return new Response("Missing fields", { status: 400 });
  }

  const builder = TEMPLATES[payload.template_slug];
  if (!builder) {
    return new Response(`Unknown template_slug: ${payload.template_slug}`, {
      status: 400,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", payload.company_id)
    .single();
  if (!company) {
    return jsonResponse({ sent: 0, reason: "company not found" });
  }
  const companyName =
    (company.company_name as string | null) ?? (company.legal_name as string) ?? "";

  const { data: links } = await supabase
    .from("profile_companies")
    .select("profile:profiles(id, email, full_name)")
    .eq("company_id", payload.company_id);
  if (!links || links.length === 0) {
    return jsonResponse({ sent: 0, reason: "no contacts" });
  }

  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", payload.sent_by_id)
    .single();
  const senderName =
    (senderProfile?.full_name as string | null) ??
    (senderProfile?.email as string | null) ??
    "tu asesor";

  // Nombre del apartado para el cuerpo del email
  const { data: clientApartado } = await supabase
    .schema("documentation")
    .from("client_apartados")
    .select("apartado_id")
    .eq("id", payload.client_apartado_id)
    .single();
  const { data: catApartado } = clientApartado
    ? await supabase
        .schema("documentation")
        .from("apartados")
        .select("name")
        .eq("id", clientApartado.apartado_id as string)
        .single()
    : { data: null };
  const apartadoName = (catApartado?.name as string | null) ?? "el apartado pendiente";

  const apartadoUrl = `${APP_URL}/set-company?companyId=${payload.company_id}&next=${encodeURIComponent(
    "/empresa"
  )}`;

  let sent = 0;
  const errors: string[] = [];

  for (const link of links) {
    const profile = link.profile as
      | { id: string; email: string; full_name: string | null }
      | null;
    if (!profile?.email) continue;

    const ctx: BuildContext = {
      companyId: payload.company_id,
      companyName,
      recipientName: profile.full_name,
      senderName,
      apartadoName,
      apartadoUrl,
    };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: profile.email,
        subject: builder.subject(ctx),
        html: builder.html(ctx),
        text: builder.text(ctx),
      }),
    });
    if (res.ok) {
      sent++;
    } else {
      const err = await res.text();
      errors.push(`${profile.email}: ${err}`);
      console.error(
        `[notify-doc-template-email] Resend error for ${profile.email}:`,
        err
      );
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

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ============================================================================
// Plantilla: dashboard-holded-contrato
// ============================================================================

function buildDashboardHoldedContratoHtml(ctx: BuildContext): string {
  const greeting = ctx.recipientName ? `Hola, ${ctx.recipientName}` : "Hola";
  const dashboardImg = `${EMAIL_ASSETS_BASE}/dashboard-anonimo.png`;

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

function buildDashboardHoldedContratoText(ctx: BuildContext): string {
  const greeting = ctx.recipientName ? `Hola, ${ctx.recipientName}` : "Hola";
  return `${greeting},

Os escribimos con muy buenas noticias: hemos desarrollado una mejora del servicio. Ahora podemos ofreceros la información de facturación, compras y movimientos bancarios actualizada en un Dashboard centralizado.

Volcamos vuestra información de Holded vía API, para que podáis visualizar con comodidad todos los movimientos pendientes de conciliar: facturas de venta, facturas de compra y bancos.

ACCIÓN REQUERIDA — Firma el Contrato de Tratamiento de Datos
Para activar el volcado y empezar a recibir el Dashboard, necesitamos que firméis el nuevo Contrato de Tratamiento de Datos en vuestro portal, dentro de la sección Mi empresa, en el apartado de Documentación.

Firmar el contrato: ${ctx.apartadoUrl}

— Lean Finance · Asesoría fiscal y contable
`;
}
