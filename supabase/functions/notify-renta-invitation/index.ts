// Email de invitación al formulario público de Declaración de la renta.
//
// Payload:
//   {
//     company_id: string,
//     sent_by_id: string,
//     to_profile_ids: string[],   // cuentas asociadas (clientes principales)
//   }
//
// Carga la invitation activa de la empresa, la lista de DNIs autorizados
// (para que el cliente sepa a quién puede pasar el enlace) y construye un
// email con CTA al formulario.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyWebhookSecret } from "../_shared/verify-webhook-secret.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = "Lean Finance <noreply@leanfinance.es>";
const APP_URL = "https://app.leanfinance.es";

interface Payload {
  company_id: string;
  sent_by_id: string;
  to_profile_ids: string[];
}

Deno.serve(async (req: Request) => {
  const unauthorized = verifyWebhookSecret(req);
  if (unauthorized) return unauthorized;

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  if (!payload.company_id) {
    return jsonResponse({ error: "Missing company_id" }, 400);
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

  // Empresa.
  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", payload.company_id)
    .single();
  if (!company) return jsonResponse({ sent: 0, failed: 0, reason: "company not found" });
  const companyName =
    (company.company_name as string | null) ??
    (company.legal_name as string | null) ??
    "tu empresa";

  // Invitation activa.
  const { data: invitation } = await supabase
    .schema("renta")
    .from("invitations")
    .select("token, expires_at")
    .eq("company_id", payload.company_id)
    .eq("status", "activa")
    .maybeSingle();
  if (!invitation) {
    return jsonResponse({ sent: 0, failed: 0, reason: "no active invitation" });
  }
  const publicUrl = `${APP_URL}/renta/${invitation.token}`;

  // DNIs autorizados (para el listado dentro del email).
  const { data: filers } = await supabase
    .schema("renta")
    .from("authorized_filers")
    .select("dni, full_name")
    .eq("company_id", payload.company_id)
    .order("full_name");

  // TO.
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

  const subject = `Formulario de deducciones fiscales para la declaración de la renta — Lean Finance`;
  const html = buildHtml({
    companyName,
    publicUrl,
    expiresAt: invitation.expires_at as string,
    recipientNames,
    filers: (filers ?? []) as { dni: string; full_name: string }[],
  });
  const text = buildText({
    companyName,
    publicUrl,
    recipientNames,
    filers: (filers ?? []) as { dni: string; full_name: string }[],
  });

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
    console.error("[notify-renta-invitation] Resend error:", err);
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
  publicUrl: string;
  expiresAt: string;
  recipientNames: string[];
  filers: { dni: string; full_name: string }[];
}): string {
  const greetingNames = joinNames(ctx.recipientNames);
  const greeting = greetingNames ? `Hola ${escapeHtml(greetingNames)},` : "Hola,";
  const expires = new Date(ctx.expiresAt).toLocaleDateString("es-ES");
  const filersList =
    ctx.filers.length > 0
      ? `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0 4px;">
           ${ctx.filers
             .map(
               (f) => `<tr><td style="border:1px solid #d1d5db;border-left:3px solid #00B0B7;border-radius:8px;padding:8px 12px;">
                 <p style="margin:0;font-size:13px;font-weight:600;color:#0f2444;">${escapeHtml(f.full_name)}</p>
                 <p style="margin:2px 0 0;font-size:12px;color:#6b7280;font-family:monospace;">${escapeHtml(f.dni)}</p>
               </td></tr>`,
             )
             .join("")}
         </table>`
      : `<p style="margin:0;font-size:13px;color:#b45309;background:#fef3c7;border:1px solid #fcd34d;padding:8px 12px;border-radius:8px;">Todavía no nos has indicado los DNIs de quienes van a rellenar el formulario. Avísanos antes de compartir el enlace.</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Formulario de deducciones fiscales para la declaración de la renta — Lean Finance</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;" />
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Declaración de la renta</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f2444;line-height:1.3;">Formulario para preparar tu declaración</h1>

          <p style="margin:0 0 14px;font-size:15px;color:#4b5563;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 14px;font-size:15px;color:#4b5563;line-height:1.6;">Como parte del servicio contratado por <strong>${escapeHtml(ctx.companyName)}</strong>, hemos habilitado un formulario para ver a qué deducciones fiscales tiene derecho cada persona que vaya a presentar su declaración de la renta con Lean Finance. Cada persona rellena su perfil y sus deducciones autonómicas con su propio DNI.</p>
          <p style="margin:0 0 14px;font-size:15px;color:#4b5563;line-height:1.6;">Comparte este enlace con las personas que vayan a presentar su declaración con nosotros a través de tu contratación.</p>

          <table cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
            <tr>
              <td style="background-color:#00B0B7;border-radius:8px;">
                <a href="${ctx.publicUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Rellenar mi declaración</a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0f2444;">¿Quién puede usar este enlace?</p>
          <p style="margin:0 0 12px;font-size:14px;color:#4b5563;line-height:1.6;">Tu asesor de Lean Finance ha dado de alta estos DNIs. Solo estas personas podrán rellenar el formulario (cada una con su propio DNI). Si falta alguna persona por añadir, escríbenos para incluirla.</p>

          ${filersList}

          <p style="margin:24px 0 0;font-size:14px;color:#4b5563;line-height:1.6;">Comparte el enlace con las personas de la lista para que entren cada una con su DNI. El enlace expira el <strong>${expires}</strong>.</p>

          <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el botón no funciona, copia y pega este enlace:<br/><a href="${ctx.publicUrl}" style="color:#00B0B7;word-break:break-all;">${ctx.publicUrl}</a></p>
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

function buildText(ctx: {
  companyName: string;
  publicUrl: string;
  recipientNames: string[];
  filers: { dni: string; full_name: string }[];
}): string {
  const greeting = ctx.recipientNames.length > 0 ? `Hola ${joinNames(ctx.recipientNames)},` : "Hola,";
  const filersText =
    ctx.filers.length > 0
      ? ctx.filers.map((f) => `- ${f.full_name} (${f.dni})`).join("\n")
      : "(Todavía no nos has indicado los DNIs.)";
  return `${greeting}

Como parte del servicio contratado por ${ctx.companyName}, hemos habilitado un formulario para ver a qué deducciones fiscales tiene derecho cada persona que vaya a presentar su declaración de la renta con Lean Finance. Cada persona rellena su perfil y sus deducciones autonómicas con su propio DNI.

Comparte este enlace con las personas que vayan a presentar su declaración con nosotros a través de tu contratación.

Enlace al formulario:
${ctx.publicUrl}

DNIs autorizados (si falta alguna persona por añadir, escríbenos para incluirla):
${filersText}

Comparte el enlace con las personas de la lista para que entren cada una con su DNI.

— Lean Finance · Asesoría fiscal y contable
`;
}
