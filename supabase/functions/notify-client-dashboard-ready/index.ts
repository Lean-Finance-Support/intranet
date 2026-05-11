// Email a las cuentas asociadas de una empresa anunciando que su dashboard
// fiscal está disponible. Se dispara desde el panel admin con el botón
// "Notificar al cliente" (botón de único uso por empresa).
//
// Payload:
//   {
//     company_id: string,
//     sent_by_id: string,
//     to_profile_ids: string[],  // cuentas asociadas (clientes)
//   }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = "Lean Finance <noreply@leanfinance.es>";
const APP_URL = "https://app.leanfinance.es";

interface Payload {
  company_id: string;
  sent_by_id: string;
  to_profile_ids: string[];
}

Deno.serve(async (req: Request) => {
  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  if (!payload.company_id || !payload.sent_by_id) {
    return jsonResponse({ error: "Missing fields" }, 400);
  }
  if (!payload.to_profile_ids || payload.to_profile_ids.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, reason: "no recipients" });
  }
  if (!RESEND_API_KEY) {
    return jsonResponse({
      sent: 0,
      failed: payload.to_profile_ids.length,
      error: "RESEND_API_KEY no configurado en este proyecto",
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
    return jsonResponse({ sent: 0, failed: 0, reason: "company not found" });
  }
  const companyName =
    (company.company_name as string | null) ??
    (company.legal_name as string | null) ??
    "tu empresa";

  const { data: toProfiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", payload.to_profile_ids);

  const toList = (toProfiles ?? [])
    .map((p) => p.email as string)
    .filter((e) => !!e);
  if (toList.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, reason: "no valid TO emails" });
  }

  const recipientNames = (toProfiles ?? [])
    .map((p) => firstName((p.full_name as string | null) ?? null, p.email as string))
    .filter(Boolean);

  const portalUrl = `${APP_URL}/set-company?companyId=${payload.company_id}&next=${encodeURIComponent(
    "/dashboard"
  )}`;

  const subject = `Tu dashboard fiscal está listo — ${companyName}`;
  const html = buildHtml({ companyName, portalUrl, recipientNames });
  const text = buildText({ companyName, portalUrl, recipientNames });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: toList,
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[notify-client-dashboard-ready] Resend error:", err);
    return jsonResponse({ sent: 0, failed: toList.length, error: err }, 200);
  }
  return jsonResponse({ sent: toList.length, failed: 0 });
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
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

function firstName(fullName: string | null, email: string): string {
  const trimmed = (fullName ?? "").trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  const local = (email ?? "").split("@")[0] ?? "";
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function buildHtml(ctx: {
  companyName: string;
  portalUrl: string;
  recipientNames: string[];
}): string {
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

function buildText(ctx: {
  companyName: string;
  portalUrl: string;
  recipientNames: string[];
}): string {
  const greetingNames = joinNames(ctx.recipientNames);
  const greeting = greetingNames ? `Hola ${greetingNames},` : "Hola,";
  return `${greeting}

Hemos activado el dashboard fiscal de ${ctx.companyName} en el portal. A partir de ahora podéis consultar en cualquier momento la situación de ventas, compras y bancos, además de las facturas pendientes o vencidas.

El dashboard se actualiza diariamente con los datos que mantenemos al día desde el equipo de Lean Finance.

Ver mi dashboard: ${ctx.portalUrl}

Si tenéis cualquier duda sobre las cifras o queréis profundizar en algún apartado, escribidnos y os ayudamos encantados.

— Lean Finance · Asesoría fiscal y contable
`;
}
