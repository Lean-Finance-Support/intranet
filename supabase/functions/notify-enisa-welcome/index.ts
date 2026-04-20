import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = "Lean Finance <noreply@leanfinance.es>";
const APP_URL = "https://app.leanfinance.es";
const ADMIN_URL = "https://admin.leanfinance.es";

Deno.serve(async (req: Request) => {
  const secret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { company_id: string; notification_type?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { company_id, notification_type = "welcome" } = payload;
  if (!company_id) {
    return new Response("Missing company_id", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", company_id)
    .single();

  const companyName = company?.company_name ?? company?.legal_name ?? "";

  const { data: profileLinks } = await supabase
    .from("profile_companies")
    .select("profile:profiles(id, email, full_name)")
    .eq("company_id", company_id);

  if (!profileLinks || profileLinks.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no contacts" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: enisaService } = await supabase
    .from("services")
    .select("id")
    .eq("slug", "enisa-docs")
    .single();

  async function emailsByProfileIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("email")
      .in("id", ids);
    return (profiles ?? [])
      .map((p: { email: string | null }) => p.email)
      .filter((e: string | null): e is string => !!e);
  }

  let ccEmails: string[] = [];
  if (enisaService) {
    const { data: techRoles } = await supabase
      .from("profile_roles")
      .select("profile_id, role:roles!inner(name), cs:company_services!inner(company_id, service_id)")
      .eq("scope_type", "company_service")
      .eq("cs.company_id", company_id)
      .eq("cs.service_id", enisaService.id);
    const techIds = [
      ...new Set(
        (techRoles ?? [])
          .filter((r: { role: { name: string } | null }) => r.role?.name === "T\u00e9cnico")
          .map((r: { profile_id: string }) => r.profile_id)
      ),
    ];
    ccEmails = await emailsByProfileIds(techIds);
  }

  let contactEmails = ccEmails;
  if (contactEmails.length === 0) {
    const { data: fpDept } = await supabase
      .from("departments")
      .select("id")
      .eq("slug", "financiacion-publica")
      .single();
    if (fpDept) {
      const { data: chiefRoles } = await supabase
        .from("profile_roles")
        .select("profile_id, role:roles!inner(name)")
        .eq("scope_type", "department")
        .eq("scope_id", fpDept.id);
      const chiefIds = [
        ...new Set(
          (chiefRoles ?? [])
            .filter((r: { role: { name: string } | null }) => r.role?.name === "Chief")
            .map((r: { profile_id: string }) => r.profile_id)
        ),
      ];
      contactEmails = await emailsByProfileIds(chiefIds);
    }
  }

  const html =
    notification_type === "update"
      ? await buildUpdateHtml(supabase, company_id, companyName, contactEmails)
      : buildWelcomeHtml(companyName, contactEmails);

  const subject =
    notification_type === "update"
      ? `Actualizaci\u00f3n documentaci\u00f3n ENISA \u2014 ${companyName}`
      : `Documentaci\u00f3n ENISA \u2014 ${companyName}`;

  let sent = 0;
  const errors: string[] = [];

  for (const link of profileLinks) {
    const profile = link.profile as { id: string; email: string; full_name: string | null } | null;
    if (!profile?.email) continue;

    const cc = ccEmails.filter((e) => e !== profile.email);

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
        html,
        ...(cc.length > 0 ? { cc } : {}),
      }),
    });

    if (res.ok) {
      sent++;
    } else {
      const err = await res.text();
      errors.push(`${profile.email}: ${err}`);
      console.error(`[notify-enisa] Resend error for ${profile.email}:`, err);
    }
  }

  return new Response(JSON.stringify({ sent, errors, cc_count: ccEmails.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function buildContactButtonHtml(emails: string[], companyName: string): string {
  if (emails.length === 0) return "";
  const subject = encodeURIComponent(`Consulta documentaci\u00f3n ENISA${companyName ? " \u2014 " + companyName : ""}`);
  const href = `mailto:${emails.join(",")}?subject=${subject}`;
  return `<table cellpadding="0" cellspacing="0" style="display:inline-block;"><tr><td style="border-radius:8px;border:2px solid #00B0B7;"><a href="${href}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#00B0B7;text-decoration:none;border-radius:8px;">Contacta con tu t\u00e9cnico</a></td></tr></table>`;
}

function buildWelcomeHtml(companyName: string, contactEmails: string[]): string {
  const enisaUrl = `${APP_URL}/enisa`;
  const contactBtn = buildContactButtonHtml(contactEmails, companyName);

  const docTitles = [
    "Escritura de Acta Notarial de Manifestaciones sobre Titularidad Real",
    "DNI de los socios en PDF, NIE o Pasaporte",
    "Tarjeta NIF de la empresa en PDF",
    "Certificado de situaci\u00f3n censal de la Agencia Tributaria",
    "Escrituras de Constituci\u00f3n inscritas en el Registro Mercantil",
    "Avance contable del ejercicio en curso",
    "Cuentas Anuales Presentadas en Registro Mercantil",
    "Certificado de estar al corriente con Hacienda",
    "Certificado de estar al corriente con la Seguridad Social",
    "Modelo de declaraci\u00f3n responsable",
    "Informe CIRBE",
    "Alta en el portal de ENISA",
  ];

  const rows = docTitles.map((title, i) =>
    `<tr>
      <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#0f2444;border-bottom:1px solid #f3f4f6;vertical-align:top;width:28px;">${i + 1}.</td>
      <td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${title}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;"/>
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Financiaci\u00f3n P\u00fablica</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#0f2444;line-height:1.3;">Documentaci\u00f3n para la solicitud ENISA</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">Hola,</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">Desde Lean Finance estamos gestionando la solicitud de financiaci\u00f3n ENISA para <strong>${companyName}</strong>. Para poder avanzar, necesitamos que adjunt\u00e9is la siguiente documentaci\u00f3n a trav\u00e9s de nuestro portal de clientes.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:28px;">
            <tbody>${rows}</tbody>
          </table>
          <div style="background-color:#f0fdfd;border:1px solid #99e7ea;border-radius:8px;padding:16px;margin-bottom:28px;">
            <p style="margin:0;font-size:14px;color:#0a4d52;line-height:1.6;"><strong>\u00bfC\u00f3mo adjuntar la documentaci\u00f3n?</strong><br/>Accede al portal con tu cuenta de correo y ve a la secci\u00f3n <strong>Documentaci\u00f3n ENISA</strong> en el men\u00fa lateral. Sube cada documento en su apartado correspondiente. Pulsa <strong>\u201cEnviar documentaci\u00f3n\u201d</strong> cada vez que a\u00f1adas archivos nuevos para notificar a tu t\u00e9cnico.</p>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr>
              <td style="background-color:#00B0B7;border-radius:8px;">
                <a href="${enisaUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Ir al portal</a>
              </td>
              ${contactBtn ? `<td style="padding-left:12px;">${contactBtn}</td>` : ""}
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el bot\u00f3n no funciona, copia y pega este enlace:<br/><a href="${enisaUrl}" style="color:#00B0B7;word-break:break-all;">${enisaUrl}</a></p>
        </td></tr>
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Lean Finance &middot; Financiaci\u00f3n P\u00fablica<br/>Este correo se ha enviado a los contactos de <strong>${companyName}</strong>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function buildUpdateHtml(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  companyId: string,
  companyName: string,
  contactEmails: string[]
): Promise<string> {
  const enisaUrl = `${APP_URL}/enisa`;
  const contactBtn = buildContactButtonHtml(contactEmails, companyName);

  const TOTAL_BOXES = 12;
  const { data: reviews } = await supabase
    .from("enisa_box_reviews")
    .select("status")
    .eq("company_id", companyId);

  const reviewList = (reviews ?? []) as { status: string }[];
  const validated = reviewList.filter((r) => r.status === "validated").length;
  const submitted = reviewList.filter((r) => r.status === "submitted").length;
  const rejected = reviewList.filter((r) => r.status === "rejected").length;
  const draft = TOTAL_BOXES - validated - submitted - rejected;

  const statusRows: string[] = [];
  if (validated > 0) statusRows.push(
    `<tr><td style="padding:10px 14px;font-size:13px;color:#166534;border-bottom:1px solid #f3f4f6;">\u2705 <strong>${validated}</strong> apartado${validated !== 1 ? "s" : ""} validado${validated !== 1 ? "s" : ""}</td></tr>`
  );
  if (submitted > 0) statusRows.push(
    `<tr><td style="padding:10px 14px;font-size:13px;color:#1e40af;border-bottom:1px solid #f3f4f6;">\uD83D\uDD35 <strong>${submitted}</strong> apartado${submitted !== 1 ? "s" : ""} pendiente${submitted !== 1 ? "s" : ""} de revisi\u00f3n</td></tr>`
  );
  if (rejected > 0) statusRows.push(
    `<tr><td style="padding:10px 14px;font-size:13px;color:#991b1b;border-bottom:1px solid #f3f4f6;">\u274C <strong>${rejected}</strong> apartado${rejected !== 1 ? "s" : ""} rechazado${rejected !== 1 ? "s" : ""} \u2014 necesita${rejected !== 1 ? "n" : ""} correcci\u00f3n</td></tr>`
  );
  if (draft > 0) statusRows.push(
    `<tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;">\u2B55 <strong>${draft}</strong> apartado${draft !== 1 ? "s" : ""} pendiente${draft !== 1 ? "s" : ""} de documentaci\u00f3n</td></tr>`
  );

  const bodyMessage = rejected > 0
    ? `Accede al portal para ver el motivo del rechazo y subir la documentaci\u00f3n corregida.`
    : draft > 0
    ? `Accede al portal para completar los apartados pendientes.`
    : `Tu t\u00e9cnico de Lean Finance est\u00e1 revisando la documentaci\u00f3n recibida. Te avisaremos cuando haya novedades.`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;"/>
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Financiaci\u00f3n P\u00fablica</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#0f2444;line-height:1.3;">Actualizaci\u00f3n de tu documentaci\u00f3n ENISA</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">Hola,</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">Tu t\u00e9cnico de Lean Finance ha revisado la documentaci\u00f3n de <strong>${companyName}</strong> y quiere informarte del estado actual:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">
            <tbody>${statusRows.join("")}</tbody>
          </table>
          <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;">${bodyMessage}</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr>
              <td style="background-color:#00B0B7;border-radius:8px;">
                <a href="${enisaUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Ver estado de la documentaci\u00f3n</a>
              </td>
              ${contactBtn ? `<td style="padding-left:12px;">${contactBtn}</td>` : ""}
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el bot\u00f3n no funciona, copia y pega este enlace:<br/><a href="${enisaUrl}" style="color:#00B0B7;word-break:break-all;">${enisaUrl}</a></p>
        </td></tr>
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Lean Finance &middot; Financiaci\u00f3n P\u00fablica<br/>Este correo se ha enviado a los contactos de <strong>${companyName}</strong>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
