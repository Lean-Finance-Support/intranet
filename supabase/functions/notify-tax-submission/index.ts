import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_URL = "https://admin.leanfinance.es";
const EMAIL_FROM = "LeanFinance <noreply@leanfinance.es>";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  const secret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { company_id?: string; year?: number; quarter?: number };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
  }

  const { company_id, year, quarter } = payload;
  if (!company_id || !year || !quarter) {
    return new Response(JSON.stringify({ error: "missing fields" }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", company_id)
    .single();

  const companyName = company?.company_name ?? company?.legal_name ?? "Cliente";

  const recipientMap = new Map<string, { email: string; name: string }>();

  const { data: taxService } = await supabase
    .from("services")
    .select("id")
    .eq("slug", "tax-models")
    .single();

  async function addProfilesById(ids: string[], fallbackName: string) {
    if (ids.length === 0) return;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    for (const p of profiles ?? []) {
      if (p.email && !recipientMap.has(p.id as string)) {
        recipientMap.set(p.id as string, { email: p.email, name: p.full_name ?? fallbackName });
      }
    }
  }

  if (taxService) {
    // JOIN manual: profile_roles.scope_id no tiene FK a company_services.
    const { data: cs } = await supabase
      .from("company_services")
      .select("id")
      .eq("company_id", company_id)
      .eq("service_id", taxService.id)
      .maybeSingle();

    const { data: tecnicoRole } = await supabase
      .from("roles")
      .select("id")
      .eq("name", "T\u00e9cnico")
      .maybeSingle();

    if (cs?.id && tecnicoRole?.id) {
      const { data: techRoles } = await supabase
        .from("profile_roles")
        .select("profile_id")
        .eq("scope_type", "company_service")
        .eq("role_id", tecnicoRole.id)
        .eq("scope_id", cs.id);

      const techIds = [
        ...new Set((techRoles ?? []).map((r: { profile_id: string }) => r.profile_id)),
      ];
      await addProfilesById(techIds, "T\u00e9cnico");
    }
  }

  if (recipientMap.size === 0) {
    const { data: fiscalDept } = await supabase
      .from("departments")
      .select("id")
      .eq("slug", "asesoria-fiscal-y-contable")
      .single();

    if (fiscalDept) {
      const { data: chiefRoles } = await supabase
        .from("profile_roles")
        .select("profile_id, role:roles!inner(name)")
        .eq("scope_type", "department")
        .eq("scope_id", fiscalDept.id);

      const chiefIds = [
        ...new Set(
          (chiefRoles ?? [])
            .filter((r) => (r.role as { name: string } | null)?.name === "Chief")
            .map((r) => r.profile_id as string)
        ),
      ];
      await addProfilesById(chiefIds, "Responsable");
    }
  }

  if (recipientMap.size === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no recipients" }), { status: 200 });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: "missing RESEND_API_KEY" }), { status: 500 });
  }

  const link = `${ADMIN_URL}/modelos?company=${company_id}`;
  const quarterLabel = `${quarter}\u00ba Trimestre de ${year}`;

  const results = await Promise.allSettled(
    [...recipientMap.values()].map(({ email, name }) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [email],
          subject: `${companyName} ha validado sus modelos fiscales del ${quarterLabel}`,
          html: buildEmail(name, companyName, quarterLabel, link),
          text: buildText(name, companyName, quarterLabel, link),
        }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`${email}: ${await res.text()}`);
        return email;
      })
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason));
  if (errors.length > 0) console.error("[notify-tax-submission] errors:", errors);

  return new Response(JSON.stringify({ sent, total: recipientMap.size, errors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function buildEmail(name: string, companyName: string, quarterLabel: string, link: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Modelos fiscales validados</title></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;">
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Modelos de impuestos</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#0f2444;line-height:1.3;">Modelos fiscales validados</h1>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">Hola, ${name},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
            La empresa <strong>${companyName}</strong> ha validado sus respuestas de los modelos fiscales del <strong>${quarterLabel}</strong> y est\u00e1n pendientes de tu revisi\u00f3n.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:#00B0B7;border-radius:8px;">
              <a href="${link}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Ver modelos \u2192</a>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el bot\u00f3n no funciona, copia y pega este enlace:<br/><a href="${link}" style="color:#00B0B7;word-break:break-all;">${link}</a></p>
        </td></tr>
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Lean Finance &middot; Asesor\u00eda fiscal y contable<br/>Este correo se ha enviado autom\u00e1ticamente.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildText(name: string, companyName: string, quarterLabel: string, link: string): string {
  return `Hola, ${name},\n\nLa empresa ${companyName} ha validado sus respuestas de los modelos fiscales del ${quarterLabel} y est\u00e1n pendientes de tu revisi\u00f3n.\n\nVer modelos: ${link}\n\n\u2014 Lean Finance`;
}
