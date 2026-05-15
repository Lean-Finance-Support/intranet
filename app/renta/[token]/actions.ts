"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { invalidateNotifications } from "@/lib/actions/notifications";
import {
  fetchChiefsForDepartment,
  fetchTechniciansForService,
} from "@/lib/team-queries";
import {
  findAuthorizedFiler,
  hasSubmissionForFiler,
  loadActiveDeductions,
  loadInvitationByToken,
} from "@/lib/renta/catalog";
import { isValidDni, normalizeDni } from "@/lib/renta/dni";
import { checkAndRecord } from "@/lib/renta/rate-limit";
import { isPotentiallyApplicable } from "@/lib/renta/rule-engine";
import { validateProfile } from "@/lib/renta/profile-schema";
import { SERVICE_SLUGS } from "@/lib/types/services";
import type {
  RentaProfileResponse,
  SubmitRentaInput,
  SubmitRentaResult,
  VerifyDniResult,
} from "@/lib/types/renta";

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

export async function verifyDni(token: string, dniInput: string): Promise<VerifyDniResult> {
  const ip = await clientIp();
  const supabase = createAdminClient();

  const invitation = await loadInvitationByToken(token);
  if (!invitation) return { ok: false, reason: "invalid_token" };

  // Rate-limit: 5/min por IP, 20/min por token.
  const allowed = await checkAndRecord(supabase, {
    ip,
    token,
    action: "verify_dni",
    windowSec: 60,
    maxByIp: 5,
    maxByToken: 20,
  });
  if (!allowed) return { ok: false, reason: "rate_limited" };

  const dni = normalizeDni(dniInput);
  if (!isValidDni(dni)) return { ok: false, reason: "invalid_dni" };

  const filer = await findAuthorizedFiler(invitation.company_id, dni);
  if (!filer) return { ok: false, reason: "not_authorized" };

  const already = await hasSubmissionForFiler(invitation.id, filer.id);
  if (already) return { ok: false, reason: "already_submitted" };

  return { ok: true, full_name: filer.full_name, authorized_filer_id: filer.id };
}

export async function submitRenta(input: SubmitRentaInput): Promise<SubmitRentaResult> {
  const ip = await clientIp();
  const supabase = createAdminClient();

  const invitation = await loadInvitationByToken(input.token);
  if (!invitation) return { ok: false, reason: "invalid_token" };

  // Rate-limit: 3/min por IP, 10/min por token.
  const allowed = await checkAndRecord(supabase, {
    ip,
    token: input.token,
    action: "submit",
    windowSec: 60,
    maxByIp: 3,
    maxByToken: 10,
  });
  if (!allowed) return { ok: false, reason: "rate_limited" };

  // Validar perfil universal.
  const profile = input.profile_response as RentaProfileResponse;
  const profileErrors = validateProfile(profile);
  if (profileErrors.length > 0) {
    return { ok: false, reason: "invalid_payload", message: profileErrors.join(" · ") };
  }

  // Resolver el authorized_filer y reusar su company_id (anti-spoofing).
  const { data: filerRow } = await supabase
    .schema("renta")
    .from("authorized_filers")
    .select("id, company_id, dni, full_name")
    .eq("id", input.authorized_filer_id)
    .maybeSingle();
  if (!filerRow || filerRow.company_id !== invitation.company_id) {
    return { ok: false, reason: "not_authorized" };
  }

  // Ya enviado.
  const already = await hasSubmissionForFiler(invitation.id, filerRow.id);
  if (already) return { ok: false, reason: "already_submitted" };

  // Re-evaluar el rule engine server-side y filtrar deductions_response
  // para no aceptar deducciones inelegibles inyectadas por el cliente.
  const deductions = await loadActiveDeductions(profile.ccaa);
  const applicableIds = new Set(
    deductions
      .filter((d) => isPotentiallyApplicable(d.eligibility_rule, profile))
      .map((d) => d.id),
  );
  const filteredDeductionsResponse: Record<string, Record<string, unknown>> = {};
  for (const [id, payload] of Object.entries(input.deductions_response ?? {})) {
    if (applicableIds.has(id) && payload && typeof payload === "object") {
      filteredDeductionsResponse[id] = payload as Record<string, unknown>;
    }
  }

  // Deducciones marcadas "No estoy seguro": deben ser elegibles según el rule
  // engine y no estar ya marcadas como "Sí" (una deducción no puede ser ambas).
  const uncertainDeductions = [
    ...new Set(
      (input.uncertain_deduction_ids ?? []).filter(
        (id) => applicableIds.has(id) && !(id in filteredDeductionsResponse),
      ),
    ),
  ];

  const userAgent = (await headers()).get("user-agent") ?? null;

  const { data: inserted, error } = await supabase
    .schema("renta")
    .from("submissions")
    .insert({
      invitation_id: invitation.id,
      company_id: invitation.company_id,
      authorized_filer_id: filerRow.id,
      full_name: filerRow.full_name,
      dni: filerRow.dni,
      profile_response: profile,
      deductions_response: filteredDeductionsResponse,
      uncertain_deductions: uncertainDeductions,
      // Propuesta inicial editable por el asesor: las deducciones que el
      // contribuyente marcó "Sí". El asesor las refina al revisar.
      confirmed_deductions: Object.keys(filteredDeductionsResponse),
      // Los extra_fields confirmados arrancan como copia de lo aportado por
      // el contribuyente; el asesor los corrige desde el panel.
      confirmed_deductions_response: filteredDeductionsResponse,
      submitted_ip: ip,
      submitted_user_agent: userAgent,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, reason: "already_submitted" };
    }
    return { ok: false, reason: "invalid_payload", message: error.message };
  }

  updateTag(`renta:submissions:${invitation.company_id}`);

  // Notificación in-app a técnicos asignados (+ chiefs del dpto fallback)
  // del servicio "Declaración de la renta". No bloqueamos la respuesta al
  // cliente si falla — la submission ya está guardada.
  try {
    await notifyRentaSubmission({
      companyId: invitation.company_id,
      submissionId: inserted!.id,
      filerFullName: filerRow.full_name,
      filerDni: filerRow.dni,
      appliedCount: Object.keys(filteredDeductionsResponse).length,
      uncertainCount: uncertainDeductions.length,
    });
  } catch (notifyErr) {
    console.error("[renta/submit] notify error:", notifyErr);
  }

  return { ok: true, submission_id: inserted!.id };
}

async function notifyRentaSubmission({
  companyId,
  submissionId,
  filerFullName,
  filerDni,
  appliedCount,
  uncertainCount,
}: {
  companyId: string;
  submissionId: string;
  filerFullName: string;
  filerDni: string;
  appliedCount: number;
  uncertainCount: number;
}): Promise<void> {
  const admin = createAdminClient();

  const [{ data: company }, { data: service }] = await Promise.all([
    admin
      .from("companies")
      .select("legal_name, company_name")
      .eq("id", companyId)
      .single(),
    admin
      .from("services")
      .select("id")
      .eq("slug", SERVICE_SLUGS.DECLARACION_RENTA)
      .single(),
  ]);

  if (!service?.id) {
    console.error("[renta/submit] servicio declaracion-renta no encontrado");
    return;
  }

  const recipients = new Set<string>();

  const techs = await fetchTechniciansForService(admin, companyId, service.id);
  for (const t of techs) recipients.add(t.profile_id);

  // Fallback: chiefs de los dptos a los que pertenece el servicio
  if (recipients.size === 0) {
    const { data: deptLinks } = await admin
      .from("department_services")
      .select("department_id")
      .eq("service_id", service.id);

    const deptIds = [
      ...new Set((deptLinks ?? []).map((d) => d.department_id as string)),
    ];
    for (const deptId of deptIds) {
      const chiefs = await fetchChiefsForDepartment(admin, deptId);
      for (const c of chiefs) recipients.add(c.profile_id);
    }
  }

  if (recipients.size === 0) return;

  const recipientIds = [...recipients];
  const companyLabel =
    (company?.company_name as string | null) ??
    (company?.legal_name as string | null) ??
    "Cliente";

  // Resumen de deducciones para el cuerpo del aviso.
  const deductionsSummary = [
    appliedCount > 0
      ? `${appliedCount} deducción${appliedCount === 1 ? "" : "es"} marcada${appliedCount === 1 ? "" : "s"}`
      : null,
    uncertainCount > 0
      ? `${uncertainCount} con dudas ("No estoy seguro")`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // 1. Notificación in-app.
  const rows = recipientIds.map((recipientId) => ({
    recipient_id: recipientId,
    company_id: companyId,
    title: `Nueva declaración recibida — ${filerFullName}`,
    message: `${companyLabel}: ${filerFullName} (${filerDni}) ha enviado el formulario de declaración de la renta.${
      deductionsSummary ? ` ${deductionsSummary}.` : ""
    }`,
    link: `/clientes/${companyId}/renta`,
  }));

  const { error } = await admin.from("notifications").insert(rows);
  if (error) {
    console.error("[renta/submit] notifications insert error:", error.code);
  } else {
    await invalidateNotifications(recipientIds);
  }

  // 2. Email a los técnicos vía edge function. No bloquea — si falla, el aviso
  // in-app ya ha llegado y la submission está guardada.
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[renta/submit] WEBHOOK_SECRET no configurado — email omitido");
    return;
  }
  const { error: invokeError } = await admin.functions.invoke("notify-renta-submission", {
    body: { company_id: companyId, submission_id: submissionId, to_profile_ids: recipientIds },
    headers: { "x-webhook-secret": webhookSecret },
  });
  if (invokeError) {
    console.error("[renta/submit] notify-renta-submission invoke error:", invokeError);
  }
}
