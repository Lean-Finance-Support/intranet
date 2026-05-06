// Email de bienvenida disparado al finalizar el onboarding de un cliente
// nuevo. Se envía un único email a todas las cuentas asociadas (TO) con CC a
// los supervisores asignados a los apartados iniciales y a los chiefs de los
// departamentos implicados.
//
// Payload:
//   {
//     company_id: string,
//     sent_by_id: string,
//     to_profile_ids: string[],     // cuentas asociadas (clientes)
//     cc_supervisor_ids: string[],  // supervisores de los apartados
//     cc_department_ids: string[],  // dptos seleccionados — sus chiefs van en CC
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
  cc_supervisor_ids: string[];
  cc_department_ids: string[];
}

interface ChiefInfo {
  profile_id: string;
  email: string;
  full_name: string | null;
}

interface SupervisorInfo {
  profile_id: string;
  email: string;
  full_name: string | null;
  department_id: string | null;
  department_name: string | null;
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
    return jsonResponse(
      { sent: 0, failed: payload.to_profile_ids.length, error: "RESEND_API_KEY no configurado en este proyecto" }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // ── Datos básicos ──
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

  // TO: profiles cliente
  const { data: toProfiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", payload.to_profile_ids);

  // CC: supervisores
  let ccSupervisors: { id: string; email: string; full_name: string | null }[] = [];
  if (payload.cc_supervisor_ids.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", payload.cc_supervisor_ids);
    ccSupervisors = (data ?? []) as typeof ccSupervisors;
  }

  // CC: chiefs de los deptos implicados — buscamos el rol "Chief" con scope
  // department en los department_ids dados.
  let ccChiefs: { id: string; email: string; full_name: string | null; dept_id: string }[] = [];
  if (payload.cc_department_ids.length > 0) {
    const { data: rolesRow } = await supabase
      .from("roles")
      .select("id, name");
    const chiefRoleId = (rolesRow ?? []).find(
      (r: { name: string }) => r.name === "Chief"
    )?.id as string | undefined;
    if (chiefRoleId) {
      const { data: chiefLinks } = await supabase
        .from("profile_roles")
        .select("profile_id, scope_id, profile:profiles(id, email, full_name)")
        .eq("role_id", chiefRoleId)
        .eq("scope_type", "department")
        .in("scope_id", payload.cc_department_ids);
      for (const link of chiefLinks ?? []) {
        const profile = link.profile as
          | { id: string; email: string; full_name: string | null }
          | null;
        if (!profile?.email) continue;
        ccChiefs.push({
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          dept_id: link.scope_id as string,
        });
      }
    }
  }

  // Información de supervisores con su departamento (para presentar el equipo
  // en el cuerpo del email). Los chiefs van agrupados por departamento y se
  // renderizan al final de cada grupo de técnicos del mismo departamento.
  const supervisorInfo: SupervisorInfo[] = [];
  const chiefsByDept = new Map<string, ChiefInfo[]>();
  for (const c of ccChiefs) {
    const arr = chiefsByDept.get(c.dept_id) ?? [];
    if (!arr.some((x) => x.profile_id === c.id)) {
      arr.push({ profile_id: c.id, email: c.email, full_name: c.full_name });
    }
    chiefsByDept.set(c.dept_id, arr);
  }
  if (ccSupervisors.length > 0) {
    const supIds = ccSupervisors.map((s) => s.id);
    const { data: supRoles } = await supabase
      .from("profile_roles")
      .select("profile_id, scope_id")
      .in("profile_id", supIds)
      .eq("scope_type", "department");
    const deptByProfile = new Map<string, string>();
    for (const r of supRoles ?? []) {
      const pid = r.profile_id as string;
      if (!deptByProfile.has(pid) && r.scope_id) {
        deptByProfile.set(pid, r.scope_id as string);
      }
    }
    const allDeptIds = [...new Set([...deptByProfile.values()])];
    let deptNameMap = new Map<string, string>();
    if (allDeptIds.length > 0) {
      const { data: depts } = await supabase
        .from("departments")
        .select("id, name")
        .in("id", allDeptIds);
      deptNameMap = new Map(
        (depts ?? []).map((d: { id: string; name: string }) => [d.id, d.name])
      );
    }
    for (const s of ccSupervisors) {
      const dId = deptByProfile.get(s.id) ?? null;
      supervisorInfo.push({
        profile_id: s.id,
        email: s.email,
        full_name: s.full_name,
        department_id: dId,
        department_name: dId ? deptNameMap.get(dId) ?? null : null,
      });
    }
  }

  // CC final: deduplicado, excluye los emails que ya están en TO.
  const toEmails = new Set(
    (toProfiles ?? [])
      .map((p) => (p.email as string).toLowerCase())
      .filter(Boolean)
  );
  const ccSet = new Map<string, string>();
  for (const s of ccSupervisors) {
    if (s.email && !toEmails.has(s.email.toLowerCase())) {
      ccSet.set(s.email.toLowerCase(), s.email);
    }
  }
  for (const c of ccChiefs) {
    if (c.email && !toEmails.has(c.email.toLowerCase())) {
      ccSet.set(c.email.toLowerCase(), c.email);
    }
  }
  const ccEmails = [...ccSet.values()];

  // URL al portal cliente. Pre-resuelve la cookie de empresa activa.
  const portalUrl = `${APP_URL}/set-company?companyId=${payload.company_id}&next=${encodeURIComponent(
    "/empresa"
  )}`;
  const contactoUrl = `${APP_URL}/set-company?companyId=${payload.company_id}&next=${encodeURIComponent(
    "/contacto"
  )}`;

  // mailto:"responder a todos" — abre un nuevo correo dirigido a todo el
  // equipo (técnicos + chiefs). Útil cuando el cliente de correo no expone
  // claramente el botón "Reply all" para este mensaje.
  const teamEmails = [
    ...new Set(
      [
        ...ccSupervisors.map((s) => s.email),
        ...ccChiefs.map((c) => c.email),
      ].filter(Boolean)
    ),
  ];
  const replyAllMailto =
    teamEmails.length > 0
      ? `mailto:${teamEmails.join(",")}?subject=${encodeURIComponent(
          `Consulta — ${companyName}`
        )}`
      : null;

  // Nombres de las cuentas asociadas (para el saludo).
  const recipientNames = (toProfiles ?? [])
    .map((p) => firstName((p.full_name as string | null) ?? null, p.email as string))
    .filter(Boolean);

  const subject = `Bienvenidos a Lean Finance — ${companyName}`;
  const html = buildHtml({
    companyName,
    portalUrl,
    contactoUrl,
    replyAllMailto,
    supervisors: supervisorInfo,
    chiefsByDept,
    recipientNames,
  });
  const text = buildText({
    companyName,
    portalUrl,
    contactoUrl,
    supervisors: supervisorInfo,
    chiefsByDept,
    recipientNames,
  });

  // Resend acepta `to` como array y `cc` como array. Mandamos un único email
  // con todos los TO juntos para que las cuentas asociadas vean al equipo
  // unificado.
  const toList = (toProfiles ?? [])
    .map((p) => p.email as string)
    .filter((e) => !!e);
  if (toList.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, reason: "no valid TO emails" });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: toList,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[notify-client-onboarding-welcome] Resend error:", err);
    return jsonResponse({ sent: 0, failed: toList.length, error: err }, 200);
  }
  return jsonResponse({ sent: toList.length, failed: 0, cc: ccEmails.length });
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
  contactoUrl: string;
  replyAllMailto: string | null;
  supervisors: SupervisorInfo[];
  chiefsByDept: Map<string, ChiefInfo[]>;
  recipientNames: string[];
}): string {
  // Los técnicos se agrupan por departamento (preservando el orden de
  // aparición). Tras cada grupo de técnicos del mismo dpto se inserta una
  // línea con el responsable de ese departamento.
  const subjectParam = encodeURIComponent(`Consulta — ${ctx.companyName}`);
  const groups: { deptId: string | null; supervisors: SupervisorInfo[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const s of ctx.supervisors) {
    const key = s.department_id ?? "__none__";
    let idx = groupIndex.get(key);
    if (idx === undefined) {
      idx = groups.length;
      groupIndex.set(key, idx);
      groups.push({ deptId: s.department_id, supervisors: [] });
    }
    groups[idx].supervisors.push(s);
  }
  const renderTechRow = (s: SupervisorInfo): string => {
    const name = s.full_name?.trim() || s.email;
    const mailto = `mailto:${s.email}?subject=${subjectParam}`;
    return `<tr><td>
      <a href="${mailto}" style="display:block;text-decoration:none;border:1px solid #d1d5db;border-left:3px solid #00B0B7;border-radius:8px;padding:10px 14px;background-color:#ffffff;">
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="vertical-align:middle;">
              <p style="margin:0;font-size:14px;font-weight:600;color:#0f2444;">${escapeHtml(name)}</p>
              ${
                s.department_name
                  ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(s.department_name)}</p>`
                  : ""
              }
            </td>
            <td style="vertical-align:middle;text-align:right;white-space:nowrap;">
              <span style="display:inline-block;font-size:12px;color:#00B0B7;font-weight:600;">
                Escribirle <span style="display:inline-block;margin-left:2px;">&rarr;</span>
              </span>
            </td>
          </tr>
        </table>
      </a>
    </td></tr>`;
  };
  const renderChiefsRow = (deptId: string | null): string => {
    if (!deptId) return "";
    const chiefs = ctx.chiefsByDept.get(deptId) ?? [];
    if (chiefs.length === 0) return "";
    const lines = chiefs
      .map((c) => {
        const cName = c.full_name?.trim() || c.email;
        const cMailto = `mailto:${c.email}?subject=${subjectParam}`;
        return `<p style="margin:2px 0;font-size:12px;color:#6b7280;line-height:1.5;">
          <span style="color:#9ca3af;">&rarr; Responsable del departamento:</span>
          <a href="${cMailto}" style="color:#0f2444;text-decoration:none;font-weight:600;">${escapeHtml(cName)}</a>
          <a href="${cMailto}" style="color:#00B0B7;text-decoration:none;font-weight:600;margin-left:4px;">Escribirle</a>
        </p>`;
      })
      .join("");
    return `<tr><td style="padding:4px 0 0 14px;">${lines}</td></tr>`;
  };
  const supList =
    ctx.supervisors.length > 0
      ? `
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0 6px;">
        ${groups
          .map(
            (g) =>
              `${g.supervisors.map(renderTechRow).join("")}${renderChiefsRow(g.deptId)}`
          )
          .join("")}
      </table>`
      : "";

  const greetingNames = joinNames(ctx.recipientNames);
  const greeting = greetingNames
    ? `Hola ${escapeHtml(greetingNames)},`
    : "Hola,";

  const replyAllSnippet = ctx.replyAllMailto
    ? `<a href="${ctx.replyAllMailto}" style="color:#00B0B7;text-decoration:underline;font-weight:600;">Responder a todos</a>`
    : `<strong>Responder a todos</strong>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido/a a Lean Finance</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png" alt="Lean Finance" width="160" style="display:block;" />
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#00B0B7;">Bienvenida</p>
          <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#0f2444;line-height:1.3;">Bienvenido/a a Lean Finance,</h1>

          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">Os damos la bienvenida a <strong>Lean Finance</strong>. Estamos encantados de empezar a trabajar con <strong>${escapeHtml(ctx.companyName)}</strong>.</p>

          ${
            supList
              ? `<p style="margin:24px 0 12px;font-size:15px;color:#4b5563;line-height:1.6;">Lo primero es presentar al equipo encargado de trabajar con vosotros en los servicios contratados:</p>
                 <h2 style="margin:8px 0 8px;font-size:16px;font-weight:700;color:#0f2444;">Equipo asignado</h2>
                 <p style="margin:0 0 12px;font-size:14px;color:#6b7280;line-height:1.6;">Estas serán vuestras personas de referencia, que os acompañarán desde el inicio. Pulsa sobre cualquiera de ellos o utiliza ${replyAllSnippet} para contactar.</p>
                 ${supList}
                 <p style="margin:14px 0 0;font-size:14px;color:#4b5563;line-height:1.6;">Además, en el apartado <a href="${ctx.contactoUrl}" style="color:#00B0B7;text-decoration:underline;font-weight:600;">Contacto</a> de la plataforma puedes consultar el equipo completo.</p>`
              : ""
          }

          <!-- Bloque destacado: documentación inicial -->
          <div style="margin:32px 0 24px;padding:24px 24px 20px;background:linear-gradient(135deg,#0f2444 0%,#16335a 100%);border-radius:12px;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#7DDCDF;">Primer paso</p>
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#ffffff;line-height:1.3;">Documentación inicial</h2>
            <p style="margin:0 0 12px;font-size:14px;color:#cfd8e3;line-height:1.6;">Para comenzar, hemos preparado una lista con la documentación inicial que necesitamos de vosotros. ¡Podéis verla a través del portal!</p>
            <p style="margin:0 0 16px;font-size:14px;color:#cfd8e3;line-height:1.6;">La recepción de esta documentación es <strong style="color:#ffffff;">imprescindible</strong> para iniciar el trabajo con vosotros.</p>
            <p style="margin:0 0 20px;font-size:13px;color:#7DDCDF;line-height:1.6;">Recordad iniciar sesión con el correo electrónico con el que habéis recibido este mensaje.</p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:#00B0B7;border-radius:8px;">
                  <a href="${ctx.portalUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Acceder al portal</a>
                </td>
              </tr>
            </table>
          </div>

          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">Cualquier duda, podéis escribir al equipo asignado directamente. Están encantados de ayudaros.</p>

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
  contactoUrl: string;
  supervisors: SupervisorInfo[];
  chiefsByDept: Map<string, ChiefInfo[]>;
  recipientNames: string[];
}): string {
  // Mismo agrupamiento que en HTML: técnicos por dpto y chief al final del
  // grupo.
  const groups: { deptId: string | null; supervisors: SupervisorInfo[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const s of ctx.supervisors) {
    const key = s.department_id ?? "__none__";
    let idx = groupIndex.get(key);
    if (idx === undefined) {
      idx = groups.length;
      groupIndex.set(key, idx);
      groups.push({ deptId: s.department_id, supervisors: [] });
    }
    groups[idx].supervisors.push(s);
  }
  const supList = groups
    .map((g) => {
      const techs = g.supervisors
        .map(
          (s) =>
            `- ${s.full_name?.trim() || s.email}${s.department_name ? ` — ${s.department_name}` : ""} <${s.email}>`
        )
        .join("\n");
      const chiefs = (g.deptId ? ctx.chiefsByDept.get(g.deptId) ?? [] : [])
        .map(
          (c) =>
            `    -> Responsable del departamento: ${c.full_name?.trim() || c.email} <${c.email}> — Escribirle`
        )
        .join("\n");
      return chiefs ? `${techs}\n${chiefs}` : techs;
    })
    .join("\n");
  const greetingNames = joinNames(ctx.recipientNames);
  const greeting = greetingNames ? `Hola ${greetingNames},` : "Hola,";
  return `${greeting}

Os damos la bienvenida a Lean Finance. Estamos encantados de empezar a trabajar con ${ctx.companyName}.

${
  ctx.supervisors.length > 0
    ? `Lo primero es presentar al equipo encargado de trabajar con vosotros en los servicios contratados:

EQUIPO ASIGNADO
Estas serán vuestras personas de referencia, que os acompañarán desde el inicio. Pulsa sobre cualquiera de ellos o utiliza Responder a todos para contactar.
${supList}

Además, en el apartado Contacto de la plataforma puedes consultar el equipo completo: ${ctx.contactoUrl}

`
    : ""
}DOCUMENTACIÓN INICIAL
Para comenzar, hemos preparado una lista con la documentación inicial que necesitamos de vosotros. ¡Podéis verla a través del portal! La recepción de esta documentación es imprescindible para iniciar el trabajo con vosotros.

Recordad iniciar sesión con el correo electrónico con el que habéis recibido este mensaje.

Acceder al portal: ${ctx.portalUrl}

Cualquier duda, podéis escribir al equipo asignado directamente. Están encantados de ayudaros.

— Lean Finance · Asesoría fiscal y contable
`;
}
