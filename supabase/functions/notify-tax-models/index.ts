import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = "Lean Finance <noreply@leanfinance.es>";
const APP_URL = "https://app.leanfinance.es";

function buildModelsUrl(companyId: string, year: number, quarter: number): string {
  const next = encodeURIComponent(`/modelos?year=${year}&quarter=${quarter}`);
  return `${APP_URL}/set-company?companyId=${companyId}&next=${next}`;
}

Deno.serve(async (req: Request) => {
  const secret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: {
    company_id: string;
    year: number;
    quarter: number;
    notification_type?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { company_id, year, quarter, notification_type = "update" } = payload;
  if (!company_id || !year || !quarter) {
    return new Response("Missing fields", { status: 400 });
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

  const contactEmails = await getContactEmails(supabase, company_id);

  let modelSummary: ModelSummaryItem[] = [];
  if (notification_type === "presentation") {
    const { data: models } = await supabase
      .from("tax_models")
      .select("id, model_code, is_informative, display_order")
      .eq("year", year)
      .eq("quarter", quarter)
      .order("display_order");

    if (models && models.length > 0) {
      const modelIds = models.map((m) => m.id);
      const { data: entries } = await supabase
        .from("tax_entries")
        .select("id, tax_model_id, amount, entry_type")
        .eq("company_id", company_id)
        .in("tax_model_id", modelIds);

      if (entries) {
        // Cargar respuestas del cliente para detectar aplazamientos
        const entryIds = entries.map((e) => e.id);
        const { data: responses } = await supabase
          .from("tax_client_responses")
          .select("tax_entry_id, deferment_requested")
          .in("tax_entry_id", entryIds);
        const defermentByEntry = new Map(
          (responses ?? []).map((r: { tax_entry_id: string; deferment_requested: boolean | null }) => [
            r.tax_entry_id,
            Boolean(r.deferment_requested),
          ])
        );

        const informativeIds = new Set(
          models.filter((m) => m.is_informative).map((m) => m.id)
        );
        const relevantEntries = entries.filter((e) =>
          informativeIds.has(e.tax_model_id) ? true : Number(e.amount) > 0
        );

        const modelMap = new Map(models.map((m) => [m.id, m]));
        modelSummary = relevantEntries
          .map((e) => {
            const model = modelMap.get(e.tax_model_id);
            if (!model) return null;
            const isDeferred =
              model.model_code === "303"
              && e.entry_type === "pagar"
              && defermentByEntry.get(e.id) === true;
            return {
              code: model.model_code,
              amount: Number(e.amount),
              type: model.is_informative
                ? "Informativo"
                : isDeferred
                ? "Aplazamiento"
                : e.entry_type === "pagar"
                ? "A pagar"
                : "A compensar",
              isInformative: model.is_informative ?? false,
              displayOrder: model.display_order ?? 0,
            };
          })
          .filter((x): x is ModelSummaryItem => x !== null)
          .sort((a, b) => a.displayOrder - b.displayOrder);
      }
    }
  }

  const quarterLabel = `${quarter}\u00ba Trimestre de ${year}`;
  let sent = 0;
  const errors: string[] = [];

  for (const link of profileLinks) {
    const profile = link.profile as {
      id: string;
      email: string;
      full_name: string | null;
    } | null;
    if (!profile?.email) continue;

    const isPresentation = notification_type === "presentation";
    const subject = isPresentation
      ? `Modelos de impuestos del ${quarterLabel} presentados \u2014 ${companyName}`
      : `Actualizaciones en tus modelos de impuestos del ${quarterLabel} \u2014 ${companyName}`;

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
        html: isPresentation
          ? buildPresentationHtml({ companyId: company_id, companyName, quarter, year, recipientName: profile.full_name, modelSummary, contactEmails })
          : buildUpdateHtml({ companyId: company_id, companyName, quarter, year, recipientName: profile.full_name, contactEmails }),
        text: isPresentation
          ? buildPresentationText({ companyId: company_id, companyName, quarter, year, recipientName: profile.full_name, modelSummary })
          : buildUpdateText({ companyId: company_id, companyName, quarter, year, recipientName: profile.full_name }),
      }),
    });

    if (res.ok) {
      sent++;
    } else {
      const err = await res.text();
      errors.push(`${profile.email}: ${err}`);
      console.error(`[notify-tax-models] Resend error for ${profile.email}:`, err);
    }
  }

  return new Response(JSON.stringify({ sent, errors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// deno-lint-ignore no-explicit-any
async function getContactEmails(supabase: any, companyId: string): Promise<string[]> {
  const { data: taxService } = await supabase
    .from("services")
    .select("id")
    .eq("slug", "tax-models")
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

  if (taxService) {
    const { data: techRoles } = await supabase
      .from("profile_roles")
      .select("profile_id, role:roles!inner(name), cs:company_services!inner(company_id, service_id)")
      .eq("scope_type", "company_service")
      .eq("cs.company_id", companyId)
      .eq("cs.service_id", taxService.id);

    const techIds = [
      ...new Set(
        (techRoles ?? [])
          .filter((r: { role: { name: string } | null }) => r.role?.name === "T\u00e9cnico")
          .map((r: { profile_id: string }) => r.profile_id)
      ),
    ];
    const techEmails = await emailsByProfileIds(techIds);
    if (techEmails.length > 0) return techEmails;
  }

  const { data: fiscalDept } = await supabase
    .from("departments")
    .select("id")
    .eq("slug", "asesoria-fiscal-y-contable")
    .single();

  if (!fiscalDept) return [];

  const { data: chiefRoles } = await supabase
    .from("profile_roles")
    .select("profile_id, role:roles!inner(name)")
    .eq("scope_type", "department")
    .eq("scope_id", fiscalDept.id);

  const chiefIds = [
    ...new Set(
      (chiefRoles ?? [])
        .filter((r: { role: { name: string } | null }) => r.role?.name === "Chief")
        .map((r: { profile_id: string }) => r.profile_id)
    ),
  ];
  return emailsByProfileIds(chiefIds);
}

function buildContactButtonHtml(emails: string[], companyName: string, subjectTopic: string): string {
  if (emails.length === 0) return "";
  const subject = encodeURIComponent(`${subjectTopic}${companyName ? " \u2014 " + companyName : ""}`);
  const href = `mailto:${emails.join(",")}?subject=${subject}`;
  return `<table cellpadding="0" cellspacing="0" style="display:inline-block;"><tr><td style="border-radius:8px;border:2px solid #00B0B7;"><a href="${href}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#00B0B7;text-decoration:none;border-radius:8px;">Contacta con tu t\u00e9cnico</a></td></tr></table>`;
}

interface TemplateParams {
  companyId: string;
  companyName: string;
  quarter: number;
  year: number;
  recipientName?: string | null;
  contactEmails: string[];
}

interface ModelSummaryItem {
  code: string;
  amount: number;
  type: string;
  isInformative: boolean;
  displayOrder: number;
}

interface PresentationTemplateParams extends TemplateParams {
  modelSummary: ModelSummaryItem[];
}

function buildUpdateHtml({ companyId, companyName, quarter, year, recipientName, contactEmails }: TemplateParams): string {
  const quarterLabel = `${quarter}\u00ba Trimestre de ${year}`;
  const greeting = recipientName ? `Hola, ${recipientName}` : "Hola";
  const modelsUrl = buildModelsUrl(companyId, year, quarter);
  const contactBtn = buildContactButtonHtml(contactEmails, companyName, `Consulta modelos de impuestos del ${quarterLabel}`);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Actualizaciones en tus modelos \u2014 ${quarterLabel}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;" />
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Modelos de impuestos</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#0f2444;line-height:1.3;">Hay actualizaciones disponibles en tus modelos del ${quarterLabel}</h1>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">${greeting},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">Tu asesor fiscal ha actualizado los <strong>modelos de impuestos del ${quarterLabel}</strong> para <strong>${companyName}</strong>. Accede al portal para revisarlos y validarlos.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr>
              <td style="background-color:#00B0B7;border-radius:8px;">
                <a href="${modelsUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Ver mis modelos</a>
              </td>
              ${contactBtn ? `<td style="padding-left:12px;">${contactBtn}</td>` : ""}
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el bot\u00f3n no funciona, copia y pega este enlace:<br/><a href="${modelsUrl}" style="color:#00B0B7;word-break:break-all;">${modelsUrl}</a></p>
        </td></tr>
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Lean Finance &middot; Asesor\u00eda fiscal y contable<br/>Este correo se ha enviado a los contactos de <strong>${companyName}</strong>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildUpdateText({ companyId, companyName, quarter, year, recipientName }: { companyId: string; companyName: string; quarter: number; year: number; recipientName?: string | null }): string {
  const quarterLabel = `${quarter}\u00ba Trimestre de ${year}`;
  const greeting = recipientName ? `Hola, ${recipientName}` : "Hola";
  const modelsUrl = buildModelsUrl(companyId, year, quarter);
  return `${greeting},\n\nHay actualizaciones disponibles en tus modelos de impuestos del ${quarterLabel} para ${companyName}.\nAccede al portal para revisarlos y validarlos.\n\nVer mis modelos: ${modelsUrl}\n\n\u2014 Lean Finance`;
}

function buildPresentationHtml({ companyId, companyName, quarter, year, recipientName, modelSummary, contactEmails }: PresentationTemplateParams): string {
  const quarterLabel = `${quarter}\u00ba Trimestre de ${year}`;
  const greeting = recipientName ? `Hola, ${recipientName}` : "Hola";
  const modelsUrl = buildModelsUrl(companyId, year, quarter);
  const contactBtn = buildContactButtonHtml(contactEmails, companyName, `Consulta modelos de impuestos del ${quarterLabel}`);

  const fmt = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

  const rows = modelSummary.map((i) =>
    `<tr><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#0f2444;border-bottom:1px solid #f3f4f6;">${i.code}</td><td style="padding:10px 16px;font-size:14px;color:#4b5563;border-bottom:1px solid #f3f4f6;">${i.type}</td><td style="padding:10px 16px;font-size:14px;font-family:monospace;color:#0f2444;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${i.isInformative && i.amount === 0 ? "\u2014" : fmt(i.amount)}</td></tr>`
  ).join("");

  const totalPay = modelSummary.filter((i) => !i.isInformative && i.type === "A pagar").reduce((s, i) => s + i.amount, 0);
  const totalComp = modelSummary.filter((i) => !i.isInformative && i.type === "A compensar").reduce((s, i) => s + i.amount, 0);
  const totalDeferred = modelSummary.filter((i) => i.type === "Aplazamiento").reduce((s, i) => s + i.amount, 0);

  const totalsHtml = (totalPay > 0 || totalComp > 0 || totalDeferred > 0) ? `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
    ${totalPay > 0 ? `<tr><td style="font-size:14px;color:#4b5563;padding:4px 0;">Total a pagar</td><td style="font-size:15px;font-weight:700;color:#dc2626;font-family:monospace;text-align:right;padding:4px 0;">${fmt(totalPay)}</td></tr>` : ""}
    ${totalDeferred > 0 ? `<tr><td style="font-size:14px;color:#4b5563;padding:4px 0;">Total en aplazamiento</td><td style="font-size:15px;font-weight:700;color:#00B0B7;font-family:monospace;text-align:right;padding:4px 0;">${fmt(totalDeferred)}</td></tr>` : ""}
    ${totalComp > 0 ? `<tr><td style="font-size:14px;color:#4b5563;padding:4px 0;">Total a compensar</td><td style="font-size:15px;font-weight:700;color:#2563eb;font-family:monospace;text-align:right;padding:4px 0;">${fmt(totalComp)}</td></tr>` : ""}
  </table>` : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Modelos presentados \u2014 ${quarterLabel}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;" />
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Modelos de impuestos</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#0f2444;line-height:1.3;">Tus modelos del ${quarterLabel} han sido presentados</h1>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">${greeting},</p>
          <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;">Tu asesor fiscal ha presentado los <strong>modelos de impuestos del ${quarterLabel}</strong> para <strong>${companyName}</strong>. A continuaci\u00f3n encontrar\u00e1s el resumen.</p>
          ${modelSummary.length > 0 ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:28px;">
            <thead><tr style="background-color:#f9fafb;">
              <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Modelo</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Tipo</th>
              <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Importe</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>` : ""}
          ${totalsHtml}
          <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr>
              <td style="background-color:#00B0B7;border-radius:8px;">
                <a href="${modelsUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Ver detalle en el portal</a>
              </td>
              ${contactBtn ? `<td style="padding-left:12px;">${contactBtn}</td>` : ""}
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el bot\u00f3n no funciona, copia y pega este enlace:<br/><a href="${modelsUrl}" style="color:#00B0B7;word-break:break-all;">${modelsUrl}</a></p>
        </td></tr>
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Lean Finance &middot; Asesor\u00eda fiscal y contable<br/>Este correo se ha enviado a los contactos de <strong>${companyName}</strong>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildPresentationText({ companyId, companyName, quarter, year, recipientName, modelSummary }: { companyId: string; companyName: string; quarter: number; year: number; recipientName?: string | null; modelSummary: ModelSummaryItem[] }): string {
  const quarterLabel = `${quarter}\u00ba Trimestre de ${year}`;
  const greeting = recipientName ? `Hola, ${recipientName}` : "Hola";
  const modelsUrl = buildModelsUrl(companyId, year, quarter);
  const fmt = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
  const lines = modelSummary.map((i) => `  ${i.code}: ${i.type}${i.isInformative && i.amount === 0 ? "" : " \u2014 " + fmt(i.amount)}`).join("\n");
  return `${greeting},\n\nTu asesor fiscal ha presentado los modelos de impuestos del ${quarterLabel} para ${companyName}.\n\nResumen:\n${lines}\n\nVer detalle en el portal: ${modelsUrl}\n\n\u2014 Lean Finance`;
}
