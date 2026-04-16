"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { userScopeIds } from "@/lib/require-permission";
import type { Company, TaxModelWithEntry, EntryPayload, TaxModelStatus } from "@/lib/types/tax";
import { SERVICE_SLUGS } from "@/lib/types/services";

async function requireServiceAdmin(
  serviceSlug: string,
  viewPerm: string,
  writePerm: string
) {
  const { supabase, user } = await requireAdmin();

  const { data: svc } = await supabase
    .from("services")
    .select("id")
    .eq("slug", serviceSlug)
    .single();
  if (!svc) throw new Error("Servicio no existe");

  const { data: deptSvcs } = await supabase
    .from("department_services")
    .select("department_id")
    .eq("service_id", svc.id)
    .eq("is_active", true);

  const serviceDeptIds = new Set((deptSvcs ?? []).map((d) => d.department_id as string));
  if (serviceDeptIds.size === 0) throw new Error("Sin departamento con este servicio");

  const [viewable, writable] = await Promise.all([
    userScopeIds(viewPerm, "department"),
    userScopeIds(writePerm, "department"),
  ]);

  const canView = viewable.some((id) => serviceDeptIds.has(id));
  if (!canView) throw new Error("Sin permisos para este servicio");

  const isChief = writable.some((id) => serviceDeptIds.has(id));

  return { supabase, user, isChief };
}

async function requireFiscalAdmin() {
  return requireServiceAdmin(
    SERVICE_SLUGS.TAX_MODELS,
    "view_tax_notifications",
    "create_tax_notification"
  );
}

export async function getAllCompanies(): Promise<Company[]> {
  const { supabase, user, isChief } = await requireFiscalAdmin();

  // Get the service id for tax-models
  const { data: svc } = await supabase
    .from("services")
    .select("id")
    .eq("slug", SERVICE_SLUGS.TAX_MODELS)
    .single();

  if (!svc) return [];

  // Get ALL companies with the tax-models service active
  const { data: companyServices } = await supabase
    .from("company_services")
    .select("company_id")
    .eq("service_id", svc.id)
    .eq("is_active", true);

  const serviceCompanyIds = (companyServices ?? []).map((cs) => cs.company_id as string);
  if (serviceCompanyIds.length === 0) return [];

  const [{ data, error }, { data: assignments }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, company_name, nif")
      .in("id", serviceCompanyIds)
      .order("legal_name"),
    supabase
      .from("company_technicians")
      .select("company_id")
      .eq("technician_id", user.id)
      .eq("service_id", svc.id),
  ]);

  if (error) {
    console.error("[admin/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }

  const companies = data ?? [];

  const assignedIds = new Set((assignments ?? []).map((a) => a.company_id as string));

  return companies.map((c) => ({
    ...c,
    canEdit: isChief || assignedIds.has(c.id),
    isAssigned: assignedIds.has(c.id),          // asignación explícita como técnico
  }));
}

export async function getModelsWithEntries(
  companyId: string,
  year: number,
  quarter: number
): Promise<TaxModelWithEntry[]> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase } = await requireFiscalAdmin();

  const { data: models, error: modelsError } = await supabase
    .from("tax_models")
    .select("id, year, quarter, model_code, description, display_order, is_informative")
    .eq("year", year)
    .eq("quarter", quarter)
    .order("display_order");

  if (modelsError) {
    console.error("[admin/modelos] models query error:", modelsError.code);
    throw new Error("Error al procesar la solicitud.");
  }
  if (!models || models.length === 0) return [];

  const modelIds = models.map((m) => m.id);
  const { data: entries, error: entriesError } = await supabase
    .from("tax_entries")
    .select("tax_model_id, amount, entry_type, deferment_allowed")
    .eq("company_id", companyId)
    .in("tax_model_id", modelIds);

  if (entriesError) {
    console.error("[admin/modelos] entries query error:", entriesError.code);
    throw new Error("Error al procesar la solicitud.");
  }

  const entriesByModel = new Map(
    (entries ?? []).map((e) => [
      e.tax_model_id,
      {
        amount: Number(e.amount),
        entry_type: e.entry_type as "pagar" | "percibir",
        deferment_allowed: Boolean(e.deferment_allowed),
      },
    ])
  );

  return models.map((m) => ({
    ...m,
    entry: entriesByModel.get(m.id) ?? null,
  }));
}

export async function getNotificationStatus(
  companyId: string,
  year: number,
  quarter: number
): Promise<{ notified: boolean; notified_at: string | null; presented: boolean }> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase } = await requireFiscalAdmin();

  const { data: notifications } = await supabase
    .from("tax_notifications")
    .select("notified_at, notification_type")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .order("notified_at", { ascending: false });

  const all = notifications ?? [];
  const latest = all[0] ?? null;
  const presented = all.some((n) => n.notification_type === "presentation");

  return {
    notified: !!latest,
    notified_at: latest?.notified_at ?? null,
    presented,
  };
}

export async function saveEntries(entries: EntryPayload[]): Promise<void> {
  const { supabase, user } = await requireFiscalAdmin();

  const now = new Date().toISOString();
  const rows = entries.map((e) => ({
    company_id: e.company_id,
    tax_model_id: e.tax_model_id,
    amount: e.amount,
    entry_type: e.entry_type,
    deferment_allowed: e.deferment_allowed ?? false,
    filled_by: user.id,
    updated_at: now,
  }));

  const { error } = await supabase
    .from("tax_entries")
    .upsert(rows, { onConflict: "company_id,tax_model_id" });

  if (error) {
    console.error("[admin/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
}

export async function getQuarterComment(
  companyId: string,
  year: number,
  quarter: number
): Promise<{ comment_text: string; edited_at: string | null }> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase } = await requireFiscalAdmin();

  const { data } = await supabase
    .from("tax_quarter_comments")
    .select("comment_text, edited_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .maybeSingle();

  return {
    comment_text: data?.comment_text ?? "",
    edited_at: data?.edited_at ?? null,
  };
}

export async function getClientQuarterComment(
  companyId: string,
  year: number,
  quarter: number
): Promise<{ comment_text: string; edited_at: string | null }> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase } = await requireFiscalAdmin();

  const { data } = await supabase
    .from("tax_quarter_client_comments")
    .select("comment_text, edited_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .maybeSingle();

  return {
    comment_text: data?.comment_text ?? "",
    edited_at: data?.edited_at ?? null,
  };
}

export async function saveQuarterComment(
  companyId: string,
  year: number,
  quarter: number,
  commentText: string
): Promise<void> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, user } = await requireFiscalAdmin();

  const { error } = await supabase
    .from("tax_quarter_comments")
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
    console.error("[admin/modelos] saveQuarterComment error:", error.code);
    throw new Error("Error al guardar el comentario.");
  }
}

export async function notifyClient(
  companyId: string,
  year: number,
  quarter: number
): Promise<void> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, user } = await requireFiscalAdmin();

  // Get the last notification date for this company/quarter
  const { data: lastNotification } = await supabase
    .from("tax_notifications")
    .select("notified_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("quarter", quarter)
    .order("notified_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // If re-notifying, reset status to 'pending' for entries modified since last notification
  if (lastNotification?.notified_at) {
    const { data: models } = await supabase
      .from("tax_models")
      .select("id")
      .eq("year", year)
      .eq("quarter", quarter);

    if (models && models.length > 0) {
      // Find entries modified after last notification
      const { data: modifiedEntries } = await supabase
        .from("tax_entries")
        .select("id")
        .eq("company_id", companyId)
        .in("tax_model_id", models.map((m) => m.id))
        .gt("updated_at", lastNotification.notified_at);

      if (modifiedEntries && modifiedEntries.length > 0) {
        const modifiedEntryIds = modifiedEntries.map((e) => e.id);
        await supabase
          .from("tax_client_responses")
          .update({ status: "pending", bank_account_id: null })
          .in("tax_entry_id", modifiedEntryIds);
      }
    }
  }

  // Insert new notification record
  const { error } = await supabase.from("tax_notifications").insert({
    company_id: companyId,
    year,
    quarter,
    notified_by: user.id,
    notification_type: "update",
  });

  if (error) {
    console.error("[notifyClient] insert tax_notification:", error);
    throw new Error("Error al registrar la notificación.");
  }

  // Buscar clientes asociados a esta empresa vía profile_companies
  const { data: profileLinks } = await supabase
    .from("profile_companies")
    .select("profile_id")
    .eq("company_id", companyId);

  const quarterLabel = `${quarter}T ${year}`;
  const modelsLink = `/set-company?companyId=${companyId}&next=${encodeURIComponent(`/modelos?year=${year}&quarter=${quarter}`)}`;
  for (const link of profileLinks ?? []) {
    await supabase.from("notifications").insert({
      recipient_id: link.profile_id,
      company_id: companyId,
      title: "Modelos de impuestos actualizados",
      message: `Se han actualizado tus modelos de prestación de impuestos del ${quarterLabel}. Accede para revisarlos y validarlos.`,
      link: modelsLink,
    });
  }
  // El email lo gestiona la Edge Function notify-tax-models
  // disparada automáticamente por el trigger en tax_notifications
}

export interface ClientResponseStatus {
  tax_model_id: string;
  status: TaxModelStatus;
  bank_account_iban: string;
  bank_account_label: string | null;
  deferment_requested: boolean;
  deferment_num_installments: number | null;
  deferment_first_payment_date: string | null;
}

export async function deleteEntry(companyId: string, taxModelId: string): Promise<void> {
  const { supabase } = await requireFiscalAdmin();
  const { error } = await supabase
    .from("tax_entries")
    .delete()
    .eq("company_id", companyId)
    .eq("tax_model_id", taxModelId);
  if (error) {
    console.error("[admin/modelos] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
}

export async function getClientResponses(
  companyId: string,
  year: number,
  quarter: number
): Promise<{
  submitted: boolean;
  submitted_at: string | null;
  responses: ClientResponseStatus[];
  allAccepted: boolean;
}> {
  const { supabase } = await requireFiscalAdmin();

  const [{ data: submission }, { data: lastUpdateNotification }] = await Promise.all([
    supabase
      .from("tax_client_submissions")
      .select("submitted_at")
      .eq("company_id", companyId)
      .eq("year", year)
      .eq("quarter", quarter)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tax_notifications")
      .select("notified_at")
      .eq("company_id", companyId)
      .eq("year", year)
      .eq("quarter", quarter)
      .eq("notification_type", "update")
      .order("notified_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Submission is only "active" if it happened after the last admin notification.
  // If admin re-notified after the client submitted, the client owes a new response.
  const submissionIsActive =
    !!submission &&
    (!lastUpdateNotification?.notified_at ||
      submission.submitted_at > lastUpdateNotification.notified_at);

  const { data: models } = await supabase
    .from("tax_models")
    .select("id, is_informative")
    .eq("year", year)
    .eq("quarter", quarter);

  if (!models || models.length === 0) {
    return { submitted: false, submitted_at: null, responses: [], allAccepted: false };
  }

  const { data: entries } = await supabase
    .from("tax_entries")
    .select("id, tax_model_id, amount")
    .eq("company_id", companyId)
    .in("tax_model_id", models.map((m) => m.id));

  if (!entries || entries.length === 0) {
    return { submitted: false, submitted_at: null, responses: [], allAccepted: false };
  }

  const { data: rawResponses } = await supabase
    .from("tax_client_responses")
    .select("tax_entry_id, status, deferment_requested, deferment_num_installments, deferment_first_payment_date, bank_account:company_bank_accounts(iban, label)")
    .in("tax_entry_id", entries.map((e) => e.id));

  const entryToModel = new Map(entries.map((e) => [e.id, e.tax_model_id]));

  const responses: ClientResponseStatus[] = (rawResponses ?? []).map((r) => {
    const bank = r.bank_account as unknown as { iban: string; label: string | null } | null;
    return {
      tax_model_id: entryToModel.get(r.tax_entry_id) ?? "",
      status: r.status as TaxModelStatus,
      bank_account_iban: bank?.iban ?? "",
      bank_account_label: bank?.label ?? null,
      deferment_requested: Boolean(r.deferment_requested),
      deferment_num_installments: (r.deferment_num_installments ?? null) as number | null,
      deferment_first_payment_date: (r.deferment_first_payment_date ?? null) as string | null,
    };
  });

  // Relevant entries: informative models (any amount, including 0) + non-informative with amount > 0
  const modelInfoMap = new Map(models.map((m) => [m.id, m.is_informative ?? false]));
  const relevantEntryIds = new Set(
    entries
      .filter((e) => modelInfoMap.get(e.tax_model_id) ? true : Number(e.amount) > 0)
      .map((e) => e.id)
  );

  const relevantResponses = (rawResponses ?? []).filter((r) => relevantEntryIds.has(r.tax_entry_id));
  const allAccepted =
    relevantEntryIds.size > 0 &&
    relevantResponses.length === relevantEntryIds.size &&
    relevantResponses.every((r) => r.status === "accepted");

  return {
    submitted: submissionIsActive,
    submitted_at: submissionIsActive ? submission!.submitted_at : null,
    responses,
    allAccepted,
  };
}

export async function notifyPresentation(
  companyId: string,
  year: number,
  quarter: number
): Promise<void> {
  if (quarter < 1 || quarter > 4) throw new Error("Trimestre inválido");
  if (year < 2000 || year > 2100) throw new Error("Año inválido");
  const { supabase, user } = await requireFiscalAdmin();

  // Verify all models are accepted before sending
  const { data: models } = await supabase
    .from("tax_models")
    .select("id, model_code, is_informative")
    .eq("year", year)
    .eq("quarter", quarter);

  if (!models || models.length === 0) throw new Error("No hay modelos para este trimestre.");

  const { data: allEntries } = await supabase
    .from("tax_entries")
    .select("id, tax_model_id, amount, entry_type")
    .eq("company_id", companyId)
    .in("tax_model_id", models.map((m) => m.id));

  const modelIsInformative = new Map(models.map((m) => [m.id, m.is_informative ?? false]));
  const entries = (allEntries ?? []).filter((e) =>
    modelIsInformative.get(e.tax_model_id) ? true : Number(e.amount) > 0
  );

  if (entries.length === 0) throw new Error("No hay modelos a presentar.");

  const { data: responses } = await supabase
    .from("tax_client_responses")
    .select("tax_entry_id, status")
    .in("tax_entry_id", entries.map((e) => e.id));

  const responseMap = new Map((responses ?? []).map((r) => [r.tax_entry_id, r.status]));
  const allAccepted = entries.every((e) => responseMap.get(e.id) === "accepted");
  if (!allAccepted) throw new Error("No todos los modelos están aceptados.");

  const quarterLabel = `${quarter}T ${year}`;

  // Get company name
  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", companyId)
    .single();

  const companyName = company?.company_name ?? company?.legal_name ?? "Cliente";

  // Insert notification record (presentation type)
  await supabase.from("tax_notifications").insert({
    company_id: companyId,
    year,
    quarter,
    notified_by: user.id,
    notification_type: "presentation",
  });

  // Notify clients
  const { data: profileLinks } = await supabase
    .from("profile_companies")
    .select("profile_id")
    .eq("company_id", companyId);

  const modelsLink = `/set-company?companyId=${companyId}&next=${encodeURIComponent(`/modelos?year=${year}&quarter=${quarter}`)}`;
  const notificationRows = (profileLinks ?? []).map((link) => ({
    recipient_id: link.profile_id,
    company_id: companyId,
    title: "Modelos de impuestos presentados",
    message: `Tu asesor ha presentado los modelos de impuestos del ${quarterLabel}.`,
    link: modelsLink,
  }));

  if (notificationRows.length > 0) {
    await supabase.from("notifications").insert(notificationRows);
  }
}
