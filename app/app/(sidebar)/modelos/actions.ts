"use server";

import { requireClient } from "@/lib/require-client";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchTechniciansForService, fetchChiefsForDepartment } from "@/lib/team-queries";
import type {
  TaxEntryForClient,
  TaxClientResponsePayload,
  TaxModelStatus,
} from "@/lib/types/tax";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";

export async function getClientQuarterData(
  year: number,
  quarter: number
): Promise<{
  notified: boolean;
  entries: TaxEntryForClient[];
  submitted: boolean;
  submitted_at: string | null;
  presented: boolean;
  comment: string;
  clientComment: string;
}> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, companyId } = await requireClient();

  // Check if admin has notified for this quarter
  const { data: notifications } = await supabase
    .from("tax_notifications")
    .select("notified_at, notification_type")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .order("notified_at", { ascending: false });

  const allNotifications = notifications ?? [];
  const notification = allNotifications[0] ?? null;
  const presented = allNotifications.some((n) => n.notification_type === "presentation");
  const latestUpdateNotification = allNotifications.find((n) => n.notification_type === "update") ?? null;

  if (!notification) {
    return { notified: false, entries: [], submitted: false, submitted_at: null, presented: false, comment: "", clientComment: "" };
  }

  const [{ data: commentRow }, { data: clientCommentRow }] = await Promise.all([
    supabase
      .from("tax_quarter_comments")
      .select("comment_text")
      .eq("company_id", companyId)
      .eq("year", year)
      .eq("quarter", quarter)
      .maybeSingle(),
    supabase
      .from("tax_quarter_client_comments")
      .select("comment_text")
      .eq("company_id", companyId)
      .eq("year", year)
      .eq("quarter", quarter)
      .maybeSingle(),
  ]);
  const comment = commentRow?.comment_text ?? "";
  const clientComment = clientCommentRow?.comment_text ?? "";

  // Get tax models for this quarter
  const { data: models, error: modelsError } = await supabase
    .from("tax_models")
    .select("id, model_code, description, display_order, is_informative")
    .eq("year", year)
    .eq("quarter", quarter)
    .order("display_order");

  if (modelsError) {
    console.error("[app/modelos] models query error:", modelsError.code);
    throw new Error("Error al procesar la solicitud.");
  }
  if (!models || models.length === 0) {
    return { notified: true, entries: [], submitted: false, submitted_at: null, presented, comment, clientComment };
  }

  // Get entries (only those with amount filled by admin)
  const modelIds = models.map((m) => m.id);
  const { data: rawEntries, error: entriesError } = await supabase
    .from("tax_entries")
    .select("id, tax_model_id, amount, entry_type, deferment_allowed")
    .eq("company_id", companyId)
    .in("tax_model_id", modelIds);

  if (entriesError) {
    console.error("[app/modelos] entries query error:", entriesError.code);
    throw new Error("Error al procesar la solicitud.");
  }

  const modelsMap = new Map(models.map((m) => [m.id, m]));
  // Include: non-informative with amount > 0, OR informative with any entry (even amount=0)
  const filledEntries = (rawEntries ?? []).filter((e) => {
    const model = modelsMap.get(e.tax_model_id);
    return model?.is_informative ? e.amount !== null : (e.amount !== null && Number(e.amount) !== 0);
  });

  if (filledEntries.length === 0) {
    return { notified: true, entries: [], submitted: false, submitted_at: null, presented, comment, clientComment };
  }

  // Get client responses for these entries
  const entryIds = filledEntries.map((e) => e.id);
  const { data: responses } = await supabase
    .from("tax_client_responses")
    .select("tax_entry_id, status, bank_account_id, deferment_requested, deferment_num_installments, deferment_first_payment_date")
    .in("tax_entry_id", entryIds);

  const responsesByEntry = new Map(
    (responses ?? []).map((r) => [
      r.tax_entry_id,
      {
        status: r.status as TaxModelStatus,
        bank_account_id: r.bank_account_id,
        deferment_requested: Boolean(r.deferment_requested),
        deferment_num_installments: (r.deferment_num_installments ?? null) as number | null,
        deferment_first_payment_date: (r.deferment_first_payment_date ?? null) as string | null,
      },
    ])
  );

  // Check latest submission
  const { data: submission } = await supabase
    .from("tax_client_submissions")
    .select("submitted_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build result
  const entries: TaxEntryForClient[] = filledEntries.map((e) => {
    const model = modelsMap.get(e.tax_model_id)!;
    return {
      id: e.id,
      tax_model_id: e.tax_model_id,
      model_code: model.model_code,
      description: model.description,
      amount: Number(e.amount),
      entry_type: e.entry_type as "pagar" | "percibir",
      is_informative: model.is_informative ?? false,
      deferment_allowed: Boolean(e.deferment_allowed),
      client_response: responsesByEntry.get(e.id) ?? null,
    };
  });

  // Sort by display_order
  const orderMap = new Map(models.map((m) => [m.id, m.display_order]));
  entries.sort(
    (a, b) => (orderMap.get(a.tax_model_id) ?? 0) - (orderMap.get(b.tax_model_id) ?? 0)
  );

  // Submission banner should only show if the client submitted AFTER the last admin notification.
  // If admin re-notified after the client's submission, the client owes a new response.
  const submissionIsActive =
    !!submission &&
    (!latestUpdateNotification?.notified_at ||
      submission.submitted_at > latestUpdateNotification.notified_at);

  return {
    notified: true,
    entries,
    submitted: submissionIsActive,
    submitted_at: submissionIsActive ? submission!.submitted_at : null,
    presented,
    comment,
    clientComment,
  };
}

export async function saveClientQuarterComment(
  year: number,
  quarter: number,
  commentText: string
): Promise<void> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, user, companyId } = await requireClient();

  // Si el trimestre ya está presentado, no se admiten cambios.
  const { data: presentedRow } = await supabase
    .from("tax_notifications")
    .select("id")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .eq("notification_type", "presentation")
    .limit(1)
    .maybeSingle();
  if (presentedRow) {
    throw new Error("Este trimestre ya está presentado y no admite cambios.");
  }

  const { error } = await supabase
    .from("tax_quarter_client_comments")
    .upsert(
      {
        company_id: companyId,
        year,
        quarter,
        comment_text: commentText,
        edited_by: user.id,
        edited_at: new Date().toISOString(),
      },
      { onConflict: "company_id,year,quarter" }
    );

  if (error) {
    console.error("[app/modelos] saveClientQuarterComment error:", error.code);
    throw new Error("Error al guardar el comentario.");
  }
}

export async function getBankAccounts(): Promise<CompanyBankAccount[]> {
  const { supabase, companyId } = await requireClient();

  const { data, error } = await supabase
    .from("company_bank_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false });

  if (error) {
    console.error("[app/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
  return data ?? [];
}

export async function addBankAccount(
  iban: string,
  label: string | null,
  bankName: string | null
): Promise<CompanyBankAccount> {
  const { supabase, companyId } = await requireClient();

  // Check if this is the first account (make it default)
  const { count } = await supabase
    .from("company_bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  const isFirst = (count ?? 0) === 0;

  const { data, error } = await supabase
    .from("company_bank_accounts")
    .insert({
      company_id: companyId,
      iban: iban.replace(/\s/g, "").toUpperCase(),
      label,
      bank_name: bankName,
      is_default: isFirst,
    })
    .select()
    .single();

  if (error) {
    console.error("[app/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
  return data;
}

export async function saveClientResponses(
  responses: TaxClientResponsePayload[]
): Promise<void> {
  const { supabase, user } = await requireClient();

  const now = new Date().toISOString();

  // Validación servidor: si deferment_requested=true, plazos 1-12 y fecha día 5 o 20.
  // La UI ya filtra por 303/pagar/deferment_allowed, pero blindamos aquí igualmente.
  for (const r of responses) {
    if (!r.deferment_requested) continue;
    const n = r.deferment_num_installments ?? 0;
    if (n < 1 || n > 12) {
      throw new Error("Número de plazos inválido.");
    }
    const date = r.deferment_first_payment_date ?? "";
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) throw new Error("Fecha de aplazamiento inválida.");
    const day = parseInt(match[3], 10);
    if (day !== 5 && day !== 20) throw new Error("El día del aplazamiento debe ser 5 o 20.");
    if (r.status !== "accepted") {
      throw new Error("Solo se puede solicitar aplazamiento sobre un modelo aceptado.");
    }
  }

  const rows = responses.map((r) => ({
    tax_entry_id: r.tax_entry_id,
    bank_account_id: r.bank_account_id ?? null,
    status: r.status,
    approved: r.status === "accepted",
    approved_by: user.id,
    approved_at: now,
    deferment_requested: r.deferment_requested ?? false,
    deferment_num_installments: r.deferment_requested ? r.deferment_num_installments ?? null : null,
    deferment_first_payment_date: r.deferment_requested ? r.deferment_first_payment_date ?? null : null,
  }));

  const { error } = await supabase
    .from("tax_client_responses")
    .upsert(rows, { onConflict: "tax_entry_id" });

  if (error) {
    console.error("[app/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
}

export async function getAdvisorContactInfo(): Promise<{
  emails: string[];
  companyName: string;
}> {
  const { supabase, companyId } = await requireClient();
  const admin = createAdminClient();

  const [{ data: company }, { data: taxService }] = await Promise.all([
    supabase
      .from("companies")
      .select("legal_name, company_name")
      .eq("id", companyId)
      .single(),
    admin
      .from("services")
      .select("id")
      .eq("slug", "tax-models")
      .single(),
  ]);

  const companyName = company?.company_name ?? company?.legal_name ?? "";

  if (!taxService) return { emails: [], companyName };

  const techs = await fetchTechniciansForService(admin, companyId, taxService.id);
  const techEmails = techs.map((t) => t.email).filter(Boolean);
  if (techEmails.length > 0) return { emails: techEmails, companyName };

  // Fallback: chiefs del departamento fiscal
  const { data: fiscalDept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "asesoria-fiscal-y-contable")
    .single();

  if (!fiscalDept) return { emails: [], companyName };

  const chiefs = await fetchChiefsForDepartment(admin, fiscalDept.id);
  return { emails: chiefs.map((c) => c.email).filter(Boolean), companyName };
}

export async function submitQuarter(
  year: number,
  quarter: number
): Promise<void> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, user, companyId } = await requireClient();

  // Insert new submission record (multiple allowed)
  const { error: submitError } = await supabase
    .from("tax_client_submissions")
    .insert({
      company_id: companyId,
      year,
      quarter,
      submitted_by: user.id,
    });

  if (submitError) {
    console.error("[app/modelos] submit error:", submitError.code);
    throw new Error("Error al enviar el trimestre.");
  }

  // Lookups + notification insert must bypass RLS (client user no lee perms)
  const admin = createAdminClient();

  const { data: company } = await admin
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", companyId)
    .single();

  const { data: taxService } = await admin
    .from("services")
    .select("id")
    .eq("slug", "tax-models")
    .single();

  const recipients = new Set<string>();

  if (taxService) {
    const techs = await fetchTechniciansForService(admin, companyId, taxService.id);
    for (const t of techs) recipients.add(t.profile_id);
  }

  // Fallback a chiefs SOLO si no hay técnicos asignados
  if (recipients.size === 0) {
    const { data: fiscalDept } = await admin
      .from("departments")
      .select("id")
      .eq("slug", "asesoria-fiscal-y-contable")
      .single();

    if (fiscalDept) {
      const chiefs = await fetchChiefsForDepartment(admin, fiscalDept.id);
      for (const c of chiefs) recipients.add(c.profile_id);
    }
  }

  const companyName = company?.company_name ?? company?.legal_name ?? "Cliente";
  const quarterLabel = `${quarter}T ${year}`;

  if (recipients.size > 0) {
    const notificationRows = [...recipients].map((recipientId) => ({
      recipient_id: recipientId,
      company_id: companyId,
      title: `${companyName} ha validado sus modelos fiscales`,
      message: `${companyName} ha validado sus respuestas de modelos de impuestos del ${quarterLabel}.`,
      link: `/modelos?company=${companyId}`,
    }));

    const { error: notifError } = await admin
      .from("notifications")
      .insert(notificationRows);
    if (notifError) {
      console.error("[app/modelos] notifications insert error:", notifError.code);
    }
  }

  // Fire-and-forget email notifications via edge function
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[app/modelos] WEBHOOK_SECRET no configurado — omitiendo notificación");
    } else {
      const { error: fnError } = await admin.functions.invoke("notify-tax-submission", {
        body: { company_id: companyId, year, quarter },
        headers: { "x-webhook-secret": webhookSecret },
      });
      if (fnError) {
        console.error("[app/modelos] notify-tax-submission error:", fnError.message);
      }
    }
  } catch (err) {
    console.error("[app/modelos] notify-tax-submission threw:", err);
  }
}
