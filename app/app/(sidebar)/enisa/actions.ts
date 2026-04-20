"use server";

import { requireClient } from "@/lib/require-client";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchTechniciansForService, fetchChiefsForDepartment } from "@/lib/team-queries";
import type {
  EnisaDocument,
  EnisaBoxReview,
  EnisaCredentials,
  EnisaBoxData,
  EnisaDocumentTypeKey,
} from "@/lib/types/enisa";
import { ENISA_DOCUMENT_TYPES, computeBoxStatus } from "@/lib/types/enisa";

export async function getEnisaData(): Promise<{
  boxes: EnisaBoxData[];
  hasSubmitted: boolean;
  lastSubmittedAt: string | null;
  advisorEmails: string[];
  companyName: string;
}> {
  const { supabase, companyId } = await requireClient();

  const [
    { data: documents },
    { data: reviews },
    { data: credentials },
    { data: submissions },
    { data: company },
    { data: enisaService },
  ] = await Promise.all([
    supabase
      .from("enisa_documents")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at"),
    supabase
      .from("enisa_box_reviews")
      .select("*")
      .eq("company_id", companyId),
    supabase
      .from("enisa_credentials")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("enisa_submissions")
      .select("submitted_at")
      .eq("company_id", companyId)
      .order("submitted_at", { ascending: false })
      .limit(1),
    supabase
      .from("companies")
      .select("legal_name, company_name")
      .eq("id", companyId)
      .single(),
    supabase
      .from("services")
      .select("id")
      .eq("slug", "enisa-docs")
      .maybeSingle(),
  ]);

  const resolvedCompanyName = company?.company_name ?? company?.legal_name ?? "";

  // Resolve advisor emails
  let advisorEmails: string[] = [];
  if (enisaService) {
    const techs = await fetchTechniciansForService(supabase, companyId, enisaService.id);
    advisorEmails = techs.map((t) => t.email).filter(Boolean);
  }

  if (advisorEmails.length === 0) {
    const admin = createAdminClient();
    const { data: fpDept } = await admin
      .from("departments")
      .select("id")
      .eq("slug", "financiacion-publica")
      .maybeSingle();

    if (fpDept) {
      const chiefs = await fetchChiefsForDepartment(admin, fpDept.id);
      advisorEmails = chiefs.map((c) => c.email).filter(Boolean);
    }
  }

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

  return {
    boxes,
    hasSubmitted: !!lastSub,
    lastSubmittedAt: lastSub?.submitted_at ?? null,
    advisorEmails,
    companyName: resolvedCompanyName,
  };
}

export async function getUploadUrl(
  typeKey: string,
  fileName: string,
  fileSize: number,
  mimeType: string
): Promise<{ uploadUrl: string; documentId: string; filePath: string }> {
  const { user, companyId } = await requireClient();
  const admin = createAdminClient();

  if (fileSize > 10 * 1024 * 1024) {
    throw new Error("El archivo supera el límite de 10MB.");
  }

  const id = crypto.randomUUID();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${companyId}/${typeKey}/${id}_${safeName}`;

  // Generate signed upload URL
  const { data: signedData, error: signError } = await admin.storage
    .from("enisa-documents")
    .createSignedUploadUrl(filePath);

  if (signError || !signedData) {
    console.error("[enisa] signed upload error:", signError);
    throw new Error("Error al generar URL de subida.");
  }

  // Insert document record
  const { error: insertError } = await admin
    .from("enisa_documents")
    .insert({
      id,
      company_id: companyId,
      document_type_key: typeKey,
      file_name: fileName,
      file_path: filePath,
      file_size: fileSize,
      mime_type: mimeType,
      is_submitted: false,
      uploaded_by: user.id,
    });

  if (insertError) {
    console.error("[enisa] insert error:", insertError);
    throw new Error("Error al registrar el documento.");
  }

  return {
    uploadUrl: signedData.signedUrl,
    documentId: id,
    filePath,
  };
}

export async function deleteDocument(documentId: string): Promise<void> {
  const { companyId } = await requireClient();
  const admin = createAdminClient();

  // Fetch the document
  const { data: doc, error: fetchError } = await admin
    .from("enisa_documents")
    .select("*")
    .eq("id", documentId)
    .eq("company_id", companyId)
    .single();

  if (fetchError || !doc) {
    throw new Error("Documento no encontrado.");
  }

  // Check box status
  const { data: review } = await admin
    .from("enisa_box_reviews")
    .select("status")
    .eq("company_id", companyId)
    .eq("document_type_key", doc.document_type_key)
    .maybeSingle();

  if (review?.status === "validated") {
    throw new Error("Este apartado está validado y no se puede modificar.");
  }

  // If submitted and box is NOT rejected, can't delete
  if (doc.is_submitted && review?.status !== "rejected") {
    throw new Error("No puedes eliminar un documento ya enviado.");
  }

  // Delete from storage
  await admin.storage.from("enisa-documents").remove([doc.file_path]);

  // Delete from database
  const { error: deleteError } = await admin
    .from("enisa_documents")
    .delete()
    .eq("id", documentId);

  if (deleteError) {
    console.error("[enisa] delete error:", deleteError);
    throw new Error("Error al eliminar el documento.");
  }
}

export async function saveCredentials(
  username: string,
  password: string
): Promise<void> {
  const { user, companyId } = await requireClient();
  const admin = createAdminClient();

  // Check if box is validated
  const { data: review } = await admin
    .from("enisa_box_reviews")
    .select("status")
    .eq("company_id", companyId)
    .eq("document_type_key", "alta-enisa")
    .maybeSingle();

  if (review?.status === "validated") {
    throw new Error("Este apartado está validado y no se puede modificar.");
  }

  const { error } = await admin
    .from("enisa_credentials")
    .upsert(
      {
        company_id: companyId,
        username,
        password,
        is_submitted: false,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    );

  if (error) {
    console.error("[enisa] credentials error:", error);
    throw new Error("Error al guardar las credenciales.");
  }
}

export async function submitDocumentation(
  credentials?: { username: string; password: string }
): Promise<void> {
  const { supabase, user, companyId } = await requireClient();
  const admin = createAdminClient();

  // Mark all non-submitted documents as submitted
  await admin
    .from("enisa_documents")
    .update({ is_submitted: true })
    .eq("company_id", companyId)
    .eq("is_submitted", false);

  // Save & submit credentials if provided
  if (credentials && (credentials.username.trim() || credentials.password.trim())) {
    const { data: credReview } = await admin
      .from("enisa_box_reviews")
      .select("status")
      .eq("company_id", companyId)
      .eq("document_type_key", "alta-enisa")
      .maybeSingle();

    if (credReview?.status !== "validated") {
      await admin
        .from("enisa_credentials")
        .upsert(
          {
            company_id: companyId,
            username: credentials.username.trim(),
            password: credentials.password.trim(),
            is_submitted: true,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id" }
        );
    }
  }

  // For each document_type_key with docs, set review to 'submitted'
  // (only if current status is draft or rejected)
  const { data: docs } = await admin
    .from("enisa_documents")
    .select("document_type_key")
    .eq("company_id", companyId);

  const typeKeys = [...new Set((docs ?? []).map((d) => d.document_type_key))];

  // Also include alta-enisa if credentials exist
  const { data: creds } = await admin
    .from("enisa_credentials")
    .select("company_id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (creds && !typeKeys.includes("alta-enisa")) {
    typeKeys.push("alta-enisa");
  }

  for (const typeKey of typeKeys) {
    const { data: existingReview } = await admin
      .from("enisa_box_reviews")
      .select("status")
      .eq("company_id", companyId)
      .eq("document_type_key", typeKey)
      .maybeSingle();

    // Only update if draft (no review) or rejected
    if (!existingReview || existingReview.status === "rejected") {
      await admin
        .from("enisa_box_reviews")
        .upsert(
          {
            company_id: companyId,
            document_type_key: typeKey,
            status: "submitted",
            rejection_comment: null,
            reviewed_by: null,
            reviewed_at: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,document_type_key" }
        );
    }
  }

  // Log submission
  await admin.from("enisa_submissions").insert({
    company_id: companyId,
    submitted_by: user.id,
  });

  // Notify technicians
  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", companyId)
    .single();

  const { data: enisaService } = await admin
    .from("services")
    .select("id")
    .eq("slug", "enisa-docs")
    .single();

  const companyName = company?.company_name ?? company?.legal_name ?? "Cliente";
  const recipientMap = new Map<string, { email: string; name: string }>();

  if (enisaService) {
    const techs = await fetchTechniciansForService(admin, companyId, enisaService.id);
    for (const t of techs) {
      if (t.email) {
        recipientMap.set(t.profile_id, { email: t.email, name: t.full_name ?? "Técnico" });
      }
    }
  }

  // Also notify chiefs of financiacion-publica
  const { data: fpDept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "financiacion-publica")
    .single();

  if (fpDept) {
    const chiefs = await fetchChiefsForDepartment(admin, fpDept.id);
    for (const c of chiefs) {
      if (c.email && !recipientMap.has(c.profile_id)) {
        recipientMap.set(c.profile_id, { email: c.email, name: c.full_name ?? "Responsable" });
      }
    }
  }

  const notificationRows = [...recipientMap.keys()].map((recipientId) => ({
    recipient_id: recipientId,
    company_id: companyId,
    title: `${companyName} ha enviado documentación ENISA`,
    message: `La empresa ${companyName} ha enviado su documentación para la solicitud ENISA.`,
    link: `/enisa`,
  }));

  if (notificationRows.length > 0) {
    await admin.from("notifications").insert(notificationRows);
  }
}

export async function getAdvisorContactInfoEnisa(): Promise<{
  emails: string[];
  companyName: string;
}> {
  const { supabase, companyId } = await requireClient();
  const admin = createAdminClient();

  const [{ data: company }, { data: enisaService }] = await Promise.all([
    supabase
      .from("companies")
      .select("legal_name, company_name")
      .eq("id", companyId)
      .single(),
    admin
      .from("services")
      .select("id")
      .eq("slug", "enisa-docs")
      .single(),
  ]);

  const companyName = company?.company_name ?? company?.legal_name ?? "";

  if (!enisaService) return { emails: [], companyName };

  const techs = await fetchTechniciansForService(admin, companyId, enisaService.id);
  const techEmails = techs.map((t) => t.email).filter(Boolean);
  if (techEmails.length > 0) return { emails: techEmails, companyName };

  // Fallback: chiefs del departamento de financiación pública
  const { data: fpDept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "financiacion-publica")
    .single();

  if (!fpDept) return { emails: [], companyName };

  const chiefs = await fetchChiefsForDepartment(admin, fpDept.id);
  return { emails: chiefs.map((c) => c.email).filter(Boolean), companyName };
}
