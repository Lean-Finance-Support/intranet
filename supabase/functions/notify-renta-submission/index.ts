// Email a los técnicos cuando un familiar/empleado envía el formulario público
// de Declaración de la renta.
//
// Payload:
//   {
//     company_id: string,
//     submission_id: string,
//     to_profile_ids: string[],   // técnicos del servicio (+ chiefs fallback)
//   }
//
// Se invoca desde la server action submitRenta (`app/renta/[token]/actions.ts`)
// tras guardar la submission. El aviso in-app se inserta en esa misma action;
// esta función solo manda el email.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyWebhookSecret } from "../_shared/verify-webhook-secret.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = "Lean Finance <noreply@leanfinance.es>";
const ADMIN_URL = "https://admin.leanfinance.es";

const CCAA_LABELS: Record<string, string> = {
  "ES-AN": "Andalucía",
  "ES-AR": "Aragón",
  "ES-AS": "Principado de Asturias",
  "ES-IB": "Illes Balears",
  "ES-CN": "Canarias",
  "ES-CB": "Cantabria",
  "ES-CM": "Castilla-La Mancha",
  "ES-CL": "Castilla y León",
  "ES-CT": "Cataluña",
  "ES-EX": "Extremadura",
  "ES-GA": "Galicia",
  "ES-MD": "Comunidad de Madrid",
  "ES-MC": "Región de Murcia",
  "ES-RI": "La Rioja",
  "ES-VC": "Comunitat Valenciana",
};

interface Payload {
  company_id: string;
  submission_id: string;
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
  if (!payload.company_id || !payload.submission_id) {
    return jsonResponse({ error: "Missing company_id or submission_id" }, 400);
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
  const companyName =
    (company?.company_name as string | null) ??
    (company?.legal_name as string | null) ??
    "el cliente";

  // Submission.
  const { data: submission } = await supabase
    .schema("renta")
    .from("submissions")
    .select("full_name, dni, profile_response, deductions_response, uncertain_deductions")
    .eq("id", payload.submission_id)
    .single();
  if (!submission) {
    return jsonResponse({ sent: 0, failed: 0, reason: "submission not found" });
  }

  const profile = (submission.profile_response ?? {}) as { ccaa?: string };
  const ccaaLabel = CCAA_LABELS[profile.ccaa ?? ""] ?? profile.ccaa ?? "—";
  const appliedCount = Object.keys(
    (submission.deductions_response ?? {}) as Record<string, unknown>
  ).length;
  const uncertainCount = ((submission.uncertain_deductions ?? []) as string[]).length;

  // TO: emails de los técnicos.
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

  const panelUrl = `${ADMIN_URL}/clientes/${payload.company_id}/renta`;
  const filerName = (submission.full_name as string) ?? "Un contribuyente";
  const filerDni = (submission.dni as string) ?? "";

  const subject = `Nueva declaración de la renta — ${filerName} (${companyName})`;
  const html = buildHtml({
    companyName,
    filerName,
    filerDni,
    ccaaLabel,
    appliedCount,
    uncertainCount,
    panelUrl,
  });
  const text = buildText({
    companyName,
    filerName,
    filerDni,
    ccaaLabel,
    appliedCount,
    uncertainCount,
    panelUrl,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: toList, subject, html, text }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[notify-renta-submission] Resend error:", err);
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

interface EmailCtx {
  companyName: string;
  filerName: string;
  filerDni: string;
  ccaaLabel: string;
  appliedCount: number;
  uncertainCount: number;
  panelUrl: string;
}

function deductionsLine(ctx: EmailCtx): string {
  const parts: string[] = [];
  parts.push(
    `${ctx.appliedCount} deducción${ctx.appliedCount === 1 ? "" : "es"} marcada${ctx.appliedCount === 1 ? "" : "s"} como aplicable${ctx.appliedCount === 1 ? "" : "s"}`
  );
  if (ctx.uncertainCount > 0) {
    parts.push(
      `${ctx.uncertainCount} marcada${ctx.uncertainCount === 1 ? "" : "s"} como "No estoy seguro" (requiere${ctx.uncertainCount === 1 ? "" : "n"} tu valoración)`
    );
  }
  return parts.join(" · ");
}

function buildHtml(ctx: EmailCtx): string {
  const rows: [string, string][] = [
    ["Contribuyente", `${escapeHtml(ctx.filerName)} (${escapeHtml(ctx.filerDni)})`],
    ["Comunidad autónoma", escapeHtml(ctx.ccaaLabel)],
    ["Deducciones", escapeHtml(deductionsLine(ctx))],
  ];
  const rowsHtml = rows
    .map(
      ([k, v]) => `<tr>
        <td style="padding:6px 0;font-size:13px;color:#6b7280;width:170px;vertical-align:top;">${k}</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f2444;">${v}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nueva declaración de la renta</title>
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
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f2444;line-height:1.3;">Nueva declaración recibida</h1>

          <p style="margin:0 0 14px;font-size:15px;color:#4b5563;line-height:1.6;">Se ha recibido un nuevo formulario de declaración de la renta del cliente <strong>${escapeHtml(ctx.companyName)}</strong>.</p>

          <table cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 24px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
            ${rowsHtml}
          </table>

          <table cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
            <tr>
              <td style="background-color:#00B0B7;border-radius:8px;">
                <a href="${ctx.panelUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Revisar la declaración</a>
              </td>
            </tr>
          </table>

          <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el botón no funciona, copia y pega este enlace:<br/><a href="${ctx.panelUrl}" style="color:#00B0B7;word-break:break-all;">${ctx.panelUrl}</a></p>
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

function buildText(ctx: EmailCtx): string {
  return `Nueva declaración de la renta recibida

Cliente: ${ctx.companyName}
Contribuyente: ${ctx.filerName} (${ctx.filerDni})
Comunidad autónoma: ${ctx.ccaaLabel}
Deducciones: ${deductionsLine(ctx)}

Revisa la declaración en el panel:
${ctx.panelUrl}

— Lean Finance · Asesoría fiscal y contable
`;
}
