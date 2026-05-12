"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission } from "@/lib/require-permission";
import { getAuthUser } from "@/lib/cached-queries";
import { createAdminClient } from "@/lib/supabase/server";
import {
  DOCUMENTATION_BUCKET,
  buildTemplateStoragePath,
  getDocumentationSignedUrl,
} from "@/lib/storage/documentation";
import { validateUpload } from "@/lib/storage/upload-validation";
import type {
  BlockTemplate,
  ApartadoTemplate,
  ApartadoTemplateFile,
  ApartadoDepartmentLink,
  DocumentationTag,
} from "@/lib/types/documentation";
import { isValidDocumentationEmailTemplateSlug } from "@/lib/documentation/email-templates";
import { invalidateResponsibleTeam } from "@/lib/team-queries";
import {
  previewApartadoTemplateEmail,
  type EmailPreviewResult,
} from "@/lib/documentation/email-previews";

// El catálogo es transversal: la lectura es libre para cualquier admin y la
// escritura se gatea con `manage_documentation_catalog` (permiso global).

async function requireManageCatalog(): Promise<void> {
  if (!(await hasPermission("manage_documentation_catalog"))) {
    throw new Error("Sin permisos");
  }
}

// ============================================================================
// Listado del catálogo + departments
// ============================================================================

export async function listDocumentationCatalog(): Promise<{
  blocks: BlockTemplate[];
  departments: { id: string; name: string }[];
  tags: DocumentationTag[];
  canManage: boolean;
  canRequestDocumentation: boolean;
}> {
  const { supabase } = await requireAdmin();

  const [
    { data: blocks },
    { data: apartados },
    { data: deptLinks },
    { data: depts },
    { data: templates },
    { data: tagRows },
    { data: apartadoTagLinks },
  ] = await Promise.all([
    supabase
      .schema("documentation")
      .from("blocks")
      .select("id, name, slug, description, display_order")
      .order("display_order")
      .order("name"),
    supabase
      .schema("documentation")
      .from("apartados")
      .select("id, block_id, name, description, display_order, is_global, is_optional_global, email_template_slug, kind, slug")
      .order("display_order")
      .order("name"),
    supabase
      .schema("documentation")
      .from("apartado_departments")
      .select("apartado_id, department_id, is_optional"),
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .schema("documentation")
      .from("apartado_templates")
      .select("id, apartado_id, file_name, file_size, mime_type, uploaded_at, storage_path")
      .order("uploaded_at"),
    supabase
      .schema("documentation")
      .from("tags")
      .select("id, slug, name, description")
      .order("name"),
    supabase
      .schema("documentation")
      .from("apartado_tags")
      .select("apartado_id, tag_id"),
  ]);

  const apartadoDeptMap = new Map<string, ApartadoDepartmentLink[]>();
  for (const link of deptLinks ?? []) {
    const list = apartadoDeptMap.get(link.apartado_id as string) ?? [];
    list.push({
      department_id: link.department_id as string,
      is_optional: (link.is_optional as boolean | null) ?? false,
    });
    apartadoDeptMap.set(link.apartado_id as string, list);
  }
  const apartadoTagMap = new Map<string, string[]>();
  for (const link of apartadoTagLinks ?? []) {
    const list = apartadoTagMap.get(link.apartado_id as string) ?? [];
    list.push(link.tag_id as string);
    apartadoTagMap.set(link.apartado_id as string, list);
  }

  const templatesByApartado = new Map<string, ApartadoTemplateFile[]>();
  for (const t of templates ?? []) {
    const aid = t.apartado_id as string;
    const list = templatesByApartado.get(aid) ?? [];
    list.push({
      id: t.id as string,
      apartado_id: aid,
      file_name: t.file_name as string,
      file_size: t.file_size as number,
      mime_type: t.mime_type as string,
      uploaded_at: t.uploaded_at as string,
      storage_path: t.storage_path as string,
    });
    templatesByApartado.set(aid, list);
  }

  const apartadosByBlock = new Map<string, ApartadoTemplate[]>();
  for (const a of apartados ?? []) {
    const arr = apartadosByBlock.get(a.block_id as string) ?? [];
    const deptLinks = apartadoDeptMap.get(a.id as string) ?? [];
    arr.push({
      id: a.id as string,
      block_id: a.block_id as string,
      name: a.name as string,
      description: (a.description as string | null) ?? null,
      display_order: a.display_order as number,
      is_global: a.is_global as boolean,
      is_optional_global: (a.is_optional_global as boolean | null) ?? false,
      kind: ((a as { kind?: "file" | "form" }).kind ?? "file") as "file" | "form",
      slug: ((a as { slug?: string | null }).slug ?? null) as string | null,
      department_ids: deptLinks.map((d) => d.department_id),
      departments: deptLinks,
      tag_ids: apartadoTagMap.get(a.id as string) ?? [],
      templates: templatesByApartado.get(a.id as string) ?? [],
      email_template_slug: (a.email_template_slug as string | null) ?? null,
    });
    apartadosByBlock.set(a.block_id as string, arr);
  }

  const result: BlockTemplate[] = (blocks ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    slug: b.slug as string,
    description: (b.description as string | null) ?? null,
    display_order: b.display_order as number,
    apartados: apartadosByBlock.get(b.id as string) ?? [],
  }));

  const [canManage, canRequestDocumentation] = await Promise.all([
    hasPermission("manage_documentation_catalog"),
    hasPermission("request_client_documentation"),
  ]);

  const tags: DocumentationTag[] = (tagRows ?? []).map((t) => ({
    id: t.id as string,
    slug: t.slug as string,
    name: t.name as string,
    description: (t.description as string | null) ?? null,
  }));

  return {
    blocks: result,
    departments: (depts ?? []) as { id: string; name: string }[],
    tags,
    canManage,
    canRequestDocumentation,
  };
}

// ============================================================================
// Bloques
// ============================================================================

export async function createBlock(input: {
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
}): Promise<BlockTemplate> {
  await requireAdmin();
  await requireManageCatalog();

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("documentation")
    .from("blocks")
    .insert({
      name: input.name.trim(),
      slug: input.slug.trim(),
      description: input.description?.trim() || null,
      display_order: input.display_order,
    })
    .select("id, name, slug, description, display_order")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/admin/documentacion");
  return {
    id: data!.id as string,
    name: data!.name as string,
    slug: data!.slug as string,
    description: (data!.description as string | null) ?? null,
    display_order: data!.display_order as number,
    apartados: [],
  };
}

export async function updateBlock(
  blockId: string,
  input: {
    name: string;
    slug: string;
    description: string | null;
    display_order: number;
  }
): Promise<void> {
  await requireAdmin();
  await requireManageCatalog();

  const admin = createAdminClient();
  const { error } = await admin
    .schema("documentation")
    .from("blocks")
    .update({
      name: input.name.trim(),
      slug: input.slug.trim(),
      description: input.description?.trim() || null,
      display_order: input.display_order,
    })
    .eq("id", blockId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/documentacion");
}

export async function deleteBlock(blockId: string): Promise<void> {
  await requireAdmin();
  await requireManageCatalog();

  const admin = createAdminClient();
  // Comprobar que el bloque no tiene apartados (FK ON DELETE RESTRICT)
  const { count } = await admin
    .schema("documentation")
    .from("apartados")
    .select("id", { count: "exact", head: true })
    .eq("block_id", blockId);
  if ((count ?? 0) > 0) {
    throw new Error("Elimina antes los apartados del bloque");
  }
  const { error } = await admin
    .schema("documentation")
    .from("blocks")
    .delete()
    .eq("id", blockId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/documentacion");
}

// ============================================================================
// Apartados
// ============================================================================

export interface ApartadoCatalogInput {
  name: string;
  description: string | null;
  display_order: number;
  is_global: boolean;
  is_optional_global: boolean;
  departments: ApartadoDepartmentLink[];
  tag_ids: string[];
  email_template_slug: string | null;
}

export async function createApartado(
  input: ApartadoCatalogInput & { block_id: string }
): Promise<ApartadoTemplate> {
  await requireAdmin();
  await requireManageCatalog();
  if (!input.is_global && input.departments.length === 0) {
    throw new Error("Selecciona al menos un departamento");
  }
  if (input.email_template_slug && !isValidDocumentationEmailTemplateSlug(input.email_template_slug)) {
    throw new Error("Plantilla de email desconocida");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("documentation")
    .from("apartados")
    .insert({
      block_id: input.block_id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      display_order: input.display_order,
      is_global: input.is_global,
      is_optional_global: input.is_global ? input.is_optional_global : false,
      email_template_slug: input.email_template_slug,
    })
    .select("id, block_id, name, description, display_order, is_global, is_optional_global, email_template_slug")
    .single();
  if (error) throw new Error(error.message);

  const departments = input.is_global ? [] : input.departments;
  if (departments.length > 0) {
    const { error: linkError } = await admin
      .schema("documentation")
      .from("apartado_departments")
      .insert(
        departments.map((d) => ({
          apartado_id: data!.id,
          department_id: d.department_id,
          is_optional: d.is_optional,
        }))
      );
    if (linkError) throw new Error(linkError.message);
  }

  if (input.tag_ids.length > 0) {
    const { error: tagError } = await admin
      .schema("documentation")
      .from("apartado_tags")
      .insert(input.tag_ids.map((tag_id) => ({ apartado_id: data!.id, tag_id })));
    if (tagError) throw new Error(tagError.message);
  }

  revalidatePath("/admin/documentacion");
  return {
    id: data!.id as string,
    block_id: data!.block_id as string,
    name: data!.name as string,
    description: (data!.description as string | null) ?? null,
    display_order: data!.display_order as number,
    is_global: data!.is_global as boolean,
    is_optional_global: (data!.is_optional_global as boolean | null) ?? false,
    kind: ((data as { kind?: "file" | "form" } | null)?.kind ?? "file") as "file" | "form",
    slug: ((data as { slug?: string | null } | null)?.slug ?? null) as string | null,
    department_ids: departments.map((d) => d.department_id),
    departments,
    tag_ids: input.tag_ids,
    templates: [],
    email_template_slug: (data!.email_template_slug as string | null) ?? null,
  };
}

export async function updateApartado(
  apartadoId: string,
  input: ApartadoCatalogInput
): Promise<void> {
  await requireAdmin();
  await requireManageCatalog();
  if (!input.is_global && input.departments.length === 0) {
    throw new Error("Selecciona al menos un departamento");
  }
  if (input.email_template_slug && !isValidDocumentationEmailTemplateSlug(input.email_template_slug)) {
    throw new Error("Plantilla de email desconocida");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .schema("documentation")
    .from("apartados")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      display_order: input.display_order,
      is_global: input.is_global,
      is_optional_global: input.is_global ? input.is_optional_global : false,
      email_template_slug: input.email_template_slug,
    })
    .eq("id", apartadoId);
  if (error) throw new Error(error.message);

  // Reescribir department_ids (con su is_optional)
  await admin
    .schema("documentation")
    .from("apartado_departments")
    .delete()
    .eq("apartado_id", apartadoId);
  const departments = input.is_global ? [] : input.departments;
  if (departments.length > 0) {
    const { error: linkError } = await admin
      .schema("documentation")
      .from("apartado_departments")
      .insert(
        departments.map((d) => ({
          apartado_id: apartadoId,
          department_id: d.department_id,
          is_optional: d.is_optional,
        }))
      );
    if (linkError) throw new Error(linkError.message);
  }

  // Reescribir tags
  await admin
    .schema("documentation")
    .from("apartado_tags")
    .delete()
    .eq("apartado_id", apartadoId);
  if (input.tag_ids.length > 0) {
    const { error: tagError } = await admin
      .schema("documentation")
      .from("apartado_tags")
      .insert(input.tag_ids.map((tag_id) => ({ apartado_id: apartadoId, tag_id })));
    if (tagError) throw new Error(tagError.message);
  }
  // Cambios en is_global o en los departamentos del apartado afectan a la
  // pertenencia de supervisores en cualquier cliente que lo tenga asignado.
  invalidateResponsibleTeam();
  revalidatePath("/admin/documentacion");
}

export async function deleteApartado(apartadoId: string): Promise<void> {
  await requireAdmin();
  await requireManageCatalog();
  const admin = createAdminClient();

  // Comprobar que no hay instancias asignadas
  const { count } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("id", { count: "exact", head: true })
    .eq("apartado_id", apartadoId);
  if ((count ?? 0) > 0) {
    throw new Error("El apartado está asignado a algún cliente — quítalo antes");
  }

  const { error } = await admin
    .schema("documentation")
    .from("apartados")
    .delete()
    .eq("id", apartadoId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/documentacion");
}

// ============================================================================
// Reordenar (drag & drop)
// ============================================================================

export async function reorderBlocks(orderedBlockIds: string[]): Promise<void> {
  await requireAdmin();
  await requireManageCatalog();
  const admin = createAdminClient();
  // Update batched: cada bloque recibe display_order = índice
  await Promise.all(
    orderedBlockIds.map((id, idx) =>
      admin
        .schema("documentation")
        .from("blocks")
        .update({ display_order: idx })
        .eq("id", id)
    )
  );
  revalidatePath("/admin/documentacion");
}

export async function reorderApartados(
  blockId: string,
  orderedApartadoIds: string[]
): Promise<void> {
  await requireAdmin();
  await requireManageCatalog();
  const admin = createAdminClient();
  await Promise.all(
    orderedApartadoIds.map((id, idx) =>
      admin
        .schema("documentation")
        .from("apartados")
        .update({ display_order: idx })
        .eq("id", id)
        .eq("block_id", blockId)
    )
  );
  revalidatePath("/admin/documentacion");
}

// ============================================================================
// Plantillas (archivos base) por apartado del catálogo
// ============================================================================


export async function uploadApartadoTemplate(input: {
  apartadoId: string;
  fileName: string;
  fileBase64: string;
  mimeType: string;
}): Promise<ApartadoTemplateFile> {
  await requireAdmin();
  await requireManageCatalog();
  const { user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  const buffer = Buffer.from(input.fileBase64, "base64");
  validateUpload({
    mimeType: input.mimeType,
    fileName: input.fileName,
    sizeBytes: buffer.byteLength,
  });

  const admin = createAdminClient();
  const templateId = crypto.randomUUID();
  const storagePath = buildTemplateStoragePath({
    apartadoId: input.apartadoId,
    templateId,
    fileName: input.fileName,
  });

  const { error: upErr } = await admin.storage
    .from(DOCUMENTATION_BUCKET)
    .upload(storagePath, buffer, { contentType: input.mimeType });
  if (upErr) throw new Error(upErr.message);

  const { data, error: insErr } = await admin
    .schema("documentation")
    .from("apartado_templates")
    .insert({
      id: templateId,
      apartado_id: input.apartadoId,
      storage_path: storagePath,
      file_name: input.fileName,
      file_size: buffer.byteLength,
      mime_type: input.mimeType,
      uploaded_by: user.id,
    })
    .select("id, apartado_id, file_name, file_size, mime_type, uploaded_at, storage_path")
    .single();
  if (insErr) throw new Error(insErr.message);

  revalidatePath("/admin/documentacion");
  return {
    id: data!.id as string,
    apartado_id: data!.apartado_id as string,
    file_name: data!.file_name as string,
    file_size: data!.file_size as number,
    mime_type: data!.mime_type as string,
    uploaded_at: data!.uploaded_at as string,
    storage_path: data!.storage_path as string,
  };
}

export async function deleteApartadoTemplate(templateId: string): Promise<void> {
  await requireAdmin();
  await requireManageCatalog();
  const admin = createAdminClient();
  const { data: t } = await admin
    .schema("documentation")
    .from("apartado_templates")
    .select("apartado_id, storage_path")
    .eq("id", templateId)
    .single();
  if (!t) throw new Error("Plantilla no encontrada");

  await admin.storage.from(DOCUMENTATION_BUCKET).remove([t.storage_path as string]);
  const { error } = await admin
    .schema("documentation")
    .from("apartado_templates")
    .delete()
    .eq("id", templateId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/documentacion");
}

export async function getApartadoTemplateSignedUrlAdmin(templateId: string): Promise<string> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: t } = await admin
    .schema("documentation")
    .from("apartado_templates")
    .select("storage_path, file_name")
    .eq("id", templateId)
    .single();
  if (!t) throw new Error("Plantilla no encontrada");
  return getDocumentationSignedUrl(
    admin,
    t.storage_path as string,
    (t.file_name as string) ?? undefined
  );
}

/**
 * Devuelve el HTML del preview de la plantilla de email asociada a un apartado
 * del catálogo. Como esta vista no tiene una empresa concreta, se renderiza
 * con placeholders. Usado por el badge "Email asociado" del catálogo y por
 * la lista de apartados en el step 1 de Asignación múltiple.
 */
export async function getCatalogTemplatePreviewHtml(
  templateSlug: string
): Promise<EmailPreviewResult> {
  await requireAdmin();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const emailAssetsBase = `${supabaseUrl}/storage/v1/object/public/email-assets`;
  const result = previewApartadoTemplateEmail({
    slug: templateSlug,
    ctx: {
      companyName: "Empresa demo",
      recipientName: null,
      apartadoUrl:
        "https://app.leanfinance.es/set-company?companyId=COMPANY_ID&next=%2Fempresa",
      emailAssetsBase,
    },
  });
  if (!result) throw new Error(`Plantilla desconocida: ${templateSlug}`);
  return result;
}
