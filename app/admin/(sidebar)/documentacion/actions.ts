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
import type {
  BlockTemplate,
  ApartadoTemplate,
  ApartadoTemplateFile,
} from "@/lib/types/documentation";
import { isValidDocumentationEmailTemplateSlug } from "@/lib/documentation/email-templates";

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
      .select("id, block_id, name, description, display_order, is_global, email_template_slug")
      .order("display_order")
      .order("name"),
    supabase
      .schema("documentation")
      .from("apartado_departments")
      .select("apartado_id, department_id"),
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .schema("documentation")
      .from("apartado_templates")
      .select("id, apartado_id, file_name, file_size, mime_type, uploaded_at, storage_path")
      .order("uploaded_at"),
  ]);

  const apartadoDeptMap = new Map<string, string[]>();
  for (const link of deptLinks ?? []) {
    const list = apartadoDeptMap.get(link.apartado_id as string) ?? [];
    list.push(link.department_id as string);
    apartadoDeptMap.set(link.apartado_id as string, list);
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
    arr.push({
      id: a.id as string,
      block_id: a.block_id as string,
      name: a.name as string,
      description: (a.description as string | null) ?? null,
      display_order: a.display_order as number,
      is_global: a.is_global as boolean,
      department_ids: apartadoDeptMap.get(a.id as string) ?? [],
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

  return {
    blocks: result,
    departments: (depts ?? []) as { id: string; name: string }[],
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

export async function createApartado(input: {
  block_id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_global: boolean;
  department_ids: string[];
  email_template_slug: string | null;
}): Promise<ApartadoTemplate> {
  await requireAdmin();
  await requireManageCatalog();
  if (!input.is_global && input.department_ids.length === 0) {
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
      email_template_slug: input.email_template_slug,
    })
    .select("id, block_id, name, description, display_order, is_global, email_template_slug")
    .single();
  if (error) throw new Error(error.message);

  if (!input.is_global && input.department_ids.length > 0) {
    const { error: linkError } = await admin
      .schema("documentation")
      .from("apartado_departments")
      .insert(
        input.department_ids.map((deptId) => ({
          apartado_id: data!.id,
          department_id: deptId,
        }))
      );
    if (linkError) throw new Error(linkError.message);
  }

  revalidatePath("/admin/documentacion");
  return {
    id: data!.id as string,
    block_id: data!.block_id as string,
    name: data!.name as string,
    description: (data!.description as string | null) ?? null,
    display_order: data!.display_order as number,
    is_global: data!.is_global as boolean,
    department_ids: input.is_global ? [] : input.department_ids,
    templates: [],
    email_template_slug: (data!.email_template_slug as string | null) ?? null,
  };
}

export async function updateApartado(
  apartadoId: string,
  input: {
    name: string;
    description: string | null;
    display_order: number;
    is_global: boolean;
    department_ids: string[];
    email_template_slug: string | null;
  }
): Promise<void> {
  await requireAdmin();
  await requireManageCatalog();
  if (!input.is_global && input.department_ids.length === 0) {
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
      email_template_slug: input.email_template_slug,
    })
    .eq("id", apartadoId);
  if (error) throw new Error(error.message);

  // Reescribir department_ids
  await admin
    .schema("documentation")
    .from("apartado_departments")
    .delete()
    .eq("apartado_id", apartadoId);
  if (!input.is_global && input.department_ids.length > 0) {
    const { error: linkError } = await admin
      .schema("documentation")
      .from("apartado_departments")
      .insert(
        input.department_ids.map((deptId) => ({
          apartado_id: apartadoId,
          department_id: deptId,
        }))
      );
    if (linkError) throw new Error(linkError.message);
  }
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

const MAX_TEMPLATE_BYTES = 25 * 1024 * 1024;

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
  if (buffer.byteLength === 0) throw new Error("Archivo vacío");
  if (buffer.byteLength > MAX_TEMPLATE_BYTES) {
    throw new Error("La plantilla supera el tamaño máximo (25 MB)");
  }

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
