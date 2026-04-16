import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  const secret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await req.json();
  const record = payload.record as { company_id: string; submitted_by: string };
  const company_id = record?.company_id;

  if (!company_id) {
    return new Response(JSON.stringify({ error: "missing company_id" }), { status: 400 });
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

  const { data: enisaService } = await supabase
    .from("services")
    .select("id")
    .eq("slug", "enisa-docs")
    .single();

  const recipientMap = new Map<string, { email: string; name: string }>();

  if (enisaService) {
    const { data: technicians } = await supabase
      .from("company_technicians")
      .select("technician_id, profile:profiles(email, full_name)")
      .eq("company_id", company_id)
      .eq("service_id", enisaService.id);

    for (const t of technicians ?? []) {
      const p = t.profile as { email: string; full_name: string | null } | null;
      if (p?.email) recipientMap.set(t.technician_id, { email: p.email, name: p.full_name ?? "T\u00e9cnico" });
    }
  }

  const { data: fpDept } = await supabase
    .from("departments")
    .select("id")
    .eq("slug", "financiacion-publica")
    .single();

  if (fpDept) {
    const { data: chiefs } = await supabase
      .from("department_chiefs")
      .select("profile_id, profile:profiles(email, full_name)")
      .eq("department_id", fpDept.id);

    for (const c of chiefs ?? []) {
      const p = c.profile as { email: string; full_name: string | null } | null;
      if (p?.email && !recipientMap.has(c.profile_id)) {
        recipientMap.set(c.profile_id, { email: p.email, name: p.full_name ?? "Responsable" });
      }
    }
  }

  if (recipientMap.size === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
  const enisaLink = `https://admin.leanfinance.es/enisa?company=${company_id}`;

  const emailResults = await Promise.allSettled(
    [...recipientMap.values()].map(({ email, name }) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "Lean Finance <noreply@leanfinance.es>",
          to: [email],
          subject: `${companyName} ha enviado documentaci\u00f3n ENISA`,
          html: buildEmail(name, companyName, enisaLink),
        }),
      })
    )
  );

  const sent = emailResults.filter((r) => r.status === "fulfilled").length;
  return new Response(JSON.stringify({ sent, total: recipientMap.size }), { status: 200 });
});

function buildEmail(name: string, companyName: string, enisaLink: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Documentaci\u00f3n ENISA enviada</title></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;">
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Financiaci\u00f3n P\u00fablica</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#0f2444;line-height:1.3;">Nueva documentaci\u00f3n ENISA</h1>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">Hola, ${name},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
            La empresa <strong>${companyName}</strong> ha enviado su documentaci\u00f3n para la solicitud ENISA y est\u00e1 pendiente de revisi\u00f3n.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:#00B0B7;border-radius:8px;">
              <a href="${enisaLink}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Ver documentaci\u00f3n \u2192</a>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">Si el bot\u00f3n no funciona, copia y pega este enlace:<br/><a href="${enisaLink}" style="color:#00B0B7;word-break:break-all;">${enisaLink}</a></p>
        </td></tr>
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Lean Finance &middot; Financiaci\u00f3n P\u00fablica<br/>Este correo se ha enviado autom\u00e1ticamente.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
