"use server";

import { requireAdmin } from "@/lib/require-admin";
import { hasPermission, userScopeIds } from "@/lib/require-permission";
import { createAdminClient } from "@/lib/supabase/server";
import { SERVICE_SLUGS } from "@/lib/types/services";
import type {
  EnisaDocument,
  EnisaBoxReview,
  EnisaCredentials,
  EnisaBoxData,
  EnisaDocumentTypeKey,
} from "@/lib/types/enisa";
import { ENISA_DOCUMENT_TYPES, computeBoxStatus } from "@/lib/types/enisa";

export interface EnisaCompany {
  id: string;
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  canEdit: boolean;
  isAssigned: boolean;
}

async function requireEnisaAdmin() {
  const { supabase, user } = await requireAdmin();

  const { data: svc } = await supabase
    .from("services")
    .select("id")
    .eq("slug", SERVICE_SLUGS.ENISA_DOCS)
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
    userScopeIds("view_enisa_submissions", "department"),
    userScopeIds("review_enisa_submission", "department"),
  ]);

  const canView = viewable.some((id) => serviceDeptIds.has(id));
  if (!canView) throw new Error("Sin permisos para este servicio");

  const isChief = writable.some((id) => serviceDeptIds.has(id));

  return { supabase, user, isChief };
}

/**
 * Exige que el usuario pueda escribir (validar/notificar) sobre una empresa
 * concreta en el servicio ENISA: chief del dept o técnico asignado.
 */
async function requireEnisaWriteForCompany(companyId: string) {
  const ctx = await requireEnisaAdmin();
  if (ctx.isChief) return ctx;

  const { data: svc } = await ctx.supabase
    .from("services")
    .select("id")
    .eq("slug", SERVICE_SLUGS.ENISA_DOCS)
    .single();
  if (!svc) throw new Error("Servicio no existe");

  const { data: cs } = await ctx.supabase
    .from("company_services")
    .select("id")
    .eq("company_id", companyId)
    .eq("service_id", svc.id)
    .maybeSingle();
  if (!cs) throw new Error("Empresa sin servicio ENISA contratado");

  const ok = await hasPermission("view_assigned_company", {
    type: "company_service",
    companyServiceId: cs.id,
  });
  if (!ok) throw new Error("Sin permisos sobre esta empresa");

  return ctx;
}

export async function getAllEnisaCompanies(): Promise<EnisaCompany[]> {
  const { supabase, user, isChief } = await requireEnisaAdmin();

  const { data: svc } = await supabase
    .from("services")
    .select("id")
    .eq("slug", SERVICE_SLUGS.ENISA_DOCS)
    .single();

  if (!svc) return [];

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
      .is("deleted_at", null)
      .order("legal_name"),
    supabase
      .from("company_technicians")
      .select("company_id")
      .eq("technician_id", user.id)
      .eq("service_id", svc.id),
  ]);

  if (error) throw new Error("Error al procesar la solicitud.");

  const assignedIds = new Set((assignments ?? []).map((a) => a.company_id as string));

  return (data ?? []).map((c) => ({
    ...c,
    canEdit: isChief || assignedIds.has(c.id),
    isAssigned: assignedIds.has(c.id),
  }));
}

export async function getCompanyEnisaData(companyId: string): Promise<{
  boxes: EnisaBoxData[];
  welcomeEmailSent: boolean;
  welcomeEmailSentAt: string | null;
  lastUpdateSentAt: string | null;
  updateCount: number;
  lastSubmittedAt: string | null;
}> {
  await requireEnisaAdmin();
  const admin = createAdminClient();

  const [
    { data: documents },
    { data: reviews },
    { data: credentials },
    { data: submissions },
    { data: notifications },
  ] = await Promise.all([
    admin
      .from("enisa_documents")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at"),
    admin
      .from("enisa_box_reviews")
      .select("*")
      .eq("company_id", companyId),
    admin
      .from("enisa_credentials")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle(),
    admin
      .from("enisa_submissions")
      .select("submitted_at")
      .eq("company_id", companyId)
      .order("submitted_at", { ascending: false })
      .limit(1),
    admin
      .from("enisa_notifications")
      .select("notification_type, sent_at")
      .eq("company_id", companyId)
      .order("sent_at", { ascending: false }),
  ]);

  const docsByType = new Map<string, EnisaDocument[]>();
  for (const doc of (documents ?? []) as EnisaDocument[]) {
    const list = docsByType.get(doc.document_type_key) ?? [];
    list.push(doc);
    docsByType.set(doc.document_type_key, list);
  }

  const reviewsByType = new Map<string, EnisaBoxReview>();
  for (const r of (reviews ?? []) as EnisaBoxReview[]) {
    reviewsByType.set(r.document_type_key, r);
  }

  const boxes: EnisaBoxData[] = ENISA_DOCUMENT_TYPES.map((dt) => {
    const docs = docsByType.get(dt.key) ?? [];
    const review = reviewsByType.get(dt.key) ?? null;
    const hasSubmittedDocs = docs.some((d) => d.is_submitted);
    const isCredentials = "isCredentials" in dt && dt.isCredentials === true;

    return {
      typeKey: dt.key as EnisaDocumentTypeKey,
      title: dt.title,
      instructions: dt.instructions,
      order: dt.order,
      isCredentials,
      documents: docs,
      review,
      credentials: isCredentials ? (credentials as EnisaCredentials | null) : null,
      status: computeBoxStatus(review, hasSubmittedDocs),
    };
  });

  const lastSub = (submissions ?? [])[0] ?? null;
  const allNotifs = notifications ?? [];
  const welcomeNotif = allNotifs.find((n) => n.notification_type === "welcome") ?? null;
  const updateNotifs = allNotifs.filter((n) => n.notification_type === "update");
  const lastUpdateNotif = updateNotifs[0] ?? null;

  return {
    boxes,
    welcomeEmailSent: !!welcomeNotif,
    welcomeEmailSentAt: welcomeNotif?.sent_at ?? null,
    lastUpdateSentAt: lastUpdateNotif?.sent_at ?? null,
    updateCount: updateNotifs.length,
    lastSubmittedAt: lastSub?.submitted_at ?? null,
  };
}

export async function validateBox(companyId: string, typeKey: string): Promise<void> {
  const { user } = await requireEnisaWriteForCompany(companyId);
  const admin = createAdminClient();

  await admin
    .from("enisa_box_reviews")
    .upsert(
      {
        company_id: companyId,
        document_type_key: typeKey,
        status: "validated",
        rejection_comment: null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,document_type_key" }
    );
}

export async function rejectBox(
  companyId: string,
  typeKey: string,
  comment: string
): Promise<void> {
  if (!comment.trim()) throw new Error("El comentario es obligatorio.");

  const { user } = await requireEnisaWriteForCompany(companyId);
  const admin = createAdminClient();

  await admin
    .from("enisa_box_reviews")
    .upsert(
      {
        company_id: companyId,
        document_type_key: typeKey,
        status: "rejected",
        rejection_comment: comment.trim(),
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,document_type_key" }
    );
}

export async function getDownloadUrl(
  companyId: string,
  documentId: string
): Promise<string> {
  await requireEnisaAdmin();
  const admin = createAdminClient();

  const { data: doc } = await admin
    .from("enisa_documents")
    .select("file_path")
    .eq("id", documentId)
    .eq("company_id", companyId)
    .single();

  if (!doc) throw new Error("Documento no encontrado.");

  const { data, error } = await admin.storage
    .from("enisa-documents")
    .createSignedUrl(doc.file_path, 60 * 5); // 5 min

  if (error || !data) throw new Error("Error al generar URL de descarga.");

  return data.signedUrl;
}

export async function sendWelcomeEmail(companyId: string): Promise<void> {
  const { user } = await requireEnisaWriteForCompany(companyId);
  const admin = createAdminClient();

  // Only one welcome per company
  const { data: existing } = await admin
    .from("enisa_notifications")
    .select("id")
    .eq("company_id", companyId)
    .eq("notification_type", "welcome")
    .maybeSingle();

  if (existing) throw new Error("El email de bienvenida ya fue enviado para esta empresa.");

  const { count } = await admin
    .from("profile_companies")
    .select("profile_id", { count: "exact", head: true })
    .eq("company_id", companyId);

  if ((count ?? 0) === 0) throw new Error("No hay usuarios vinculados a esta empresa.");

  // Insert triggers the Edge Function notify-enisa-welcome
  await admin.from("enisa_notifications").insert({
    company_id: companyId,
    sent_by: user.id,
    notification_type: "welcome",
  });

  // In-app notification for client
  const { data: profiles } = await admin
    .from("profile_companies")
    .select("profile_id")
    .eq("company_id", companyId);

  const welcomeNotifRows = (profiles ?? []).map((pc) => ({
    recipient_id: pc.profile_id as string,
    company_id: companyId,
    title: "Documentación ENISA",
    message: "Tu técnico te ha enviado las instrucciones para adjuntar la documentación necesaria para la solicitud ENISA.",
    link: "/enisa",
  }));

  if (welcomeNotifRows.length > 0) {
    await admin.from("notifications").insert(welcomeNotifRows);
  }
}

export async function sendUpdateEmail(companyId: string): Promise<void> {
  const { user } = await requireEnisaWriteForCompany(companyId);
  const admin = createAdminClient();

  // Welcome must be sent first
  const { data: welcome } = await admin
    .from("enisa_notifications")
    .select("id")
    .eq("company_id", companyId)
    .eq("notification_type", "welcome")
    .maybeSingle();

  if (!welcome) throw new Error("Primero debes enviar el email de bienvenida.");

  // Insert triggers the Edge Function notify-enisa-welcome (handles update type)
  await admin.from("enisa_notifications").insert({
    company_id: companyId,
    sent_by: user.id,
    notification_type: "update",
  });

  // In-app notification for client
  const { data: profiles } = await admin
    .from("profile_companies")
    .select("profile_id")
    .eq("company_id", companyId);

  const updateNotifRows = (profiles ?? []).map((pc) => ({
    recipient_id: pc.profile_id as string,
    company_id: companyId,
    title: "Actualización documentación ENISA",
    message: "Tu técnico ha revisado tu documentación ENISA. Accede al portal para ver el estado actual.",
    link: "/enisa",
  }));

  if (updateNotifRows.length > 0) {
    await admin.from("notifications").insert(updateNotifRows);
  }
}
