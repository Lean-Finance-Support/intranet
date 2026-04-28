"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission, userScopeIds } from "@/lib/require-permission";
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

// La tabla de catálogo es pública para todos los admins (lectura). La escritura
// se gatea con manage_documentation_catalog: el caller debe tener el permiso en
// algún departamento del apartado o ser el creador de un apartado global (en
// cuyo caso se exige que tenga el permiso en TODOS los deptos donde el apartado
// será visible — para apartados globales se exige scope=none, ver verifyCatalogScope).

interface CatalogScope {
  // Departamentos a los que aplicará el apartado/bloque. Para is_global=true se
  // pasa departmentIds = [] y se exige que el usuario tenga el permiso en todos
  // los deptos existentes (proxy: "tener al menos un grant" no es suficiente).
  departmentIds: string[];
  isGlobal: boolean;
}

async function verifyCatalogScope(scope: CatalogScope): Promise<void> {
  const allowedDepts = await userScopeIds("manage_documentation_catalog", "department");
  if (scope.isGlobal) {
    // Para apartados globales se exige tener el permiso en todos los deptos.
    const admin = createAdminClient();
    const { data: depts } = await admin.from("departments").select("id");
    const allDeptIds = (depts ?? []).map((d) => d.id as string);
    const missing = allDeptIds.filter((id) => !allowedDepts.includes(id));
    if (missing.length > 0) {
      throw new Error("Sin permisos para crear apartados globales");
    }
    return;
  }
  if (scope.departmentIds.length === 0) {
    throw new Error("Selecciona al menos un departamento");
  }
  for (const deptId of scope.departmentIds) {
    if (!allowedDepts.includes(deptId)) {
      throw new Error("Sin permisos sobre alguno de los departamentos seleccionados");
    }
  }
}

// ============================================================================
// Listado del catálogo + departments
// ============================================================================

export async function listDocumentationCatalog(): Promise<{
  blocks: BlockTemplate[];
  departments: { id: string; name: string }[];
  canManage: boolean;
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
      .select("id, block_id, name, description, display_order, is_global")
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

  const allowedDepts = await userScopeIds("manage_documentation_catalog", "department");
  const canManage = allowedDepts.length > 0;

  return {
    blocks: result,
    departments: (depts ?? []) as { id: string; name: string }[],
    canManage,
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
  // Crear bloque "vacío" no requiere scope concreto, pero hace falta tener el
  // permiso en al menos un dept (el bloque no es útil sin apartados, y los
  // apartados ya validan su scope).
  if (!(await hasPermission("manage_documentation_catalog"))) {
    const allowed = await userScopeIds("manage_documentation_catalog", "department");
    if (allowed.length === 0) throw new Error("Sin permisos");
  }

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
  const allowed = await userScopeIds("manage_documentation_catalog", "department");
  if (allowed.length === 0) throw new Error("Sin permisos");

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
  const allowed = await userScopeIds("manage_documentation_catalog", "department");
  if (allowed.length === 0) throw new Error("Sin permisos");

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
}): Promise<ApartadoTemplate> {
  await requireAdmin();
  await verifyCatalogScope({
    departmentIds: input.department_ids,
    isGlobal: input.is_global,
  });

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
    })
    .select("id, block_id, name, description, display_order, is_global")
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
  }
): Promise<void> {
  await requireAdmin();
  await verifyCatalogScope({
    departmentIds: input.department_ids,
    isGlobal: input.is_global,
  });

  const admin = createAdminClient();
  const { error } = await admin
    .schema("documentation")
    .from("apartados")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      display_order: input.display_order,
      is_global: input.is_global,
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
  // Necesitamos saber a qué deptos pertenece para verificar permiso.
  const admin = createAdminClient();
  const [{ data: apartado }, { data: links }] = await Promise.all([
    admin
      .schema("documentation")
      .from("apartados")
      .select("is_global")
      .eq("id", apartadoId)
      .single(),
    admin
      .schema("documentation")
      .from("apartado_departments")
      .select("department_id")
      .eq("apartado_id", apartadoId),
  ]);
  if (!apartado) throw new Error("Apartado no encontrado");

  await verifyCatalogScope({
    departmentIds: (links ?? []).map((l) => l.department_id as string),
    isGlobal: apartado.is_global as boolean,
  });

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
  const allowed = await userScopeIds("manage_documentation_catalog", "department");
  if (allowed.length === 0 && !(await hasPermission("manage_documentation_catalog"))) {
    throw new Error("Sin permisos");
  }
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
  const allowed = await userScopeIds("manage_documentation_catalog", "department");
  if (allowed.length === 0 && !(await hasPermission("manage_documentation_catalog"))) {
    throw new Error("Sin permisos");
  }
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

async function ensureManageCatalogForApartado(apartadoId: string): Promise<void> {
  const admin = createAdminClient();
  const [{ data: apartado }, { data: links }] = await Promise.all([
    admin.schema("documentation").from("apartados").select("is_global").eq("id", apartadoId).single(),
    admin.schema("documentation").from("apartado_departments").select("department_id").eq("apartado_id", apartadoId),
  ]);
  if (!apartado) throw new Error("Apartado no encontrado");
  await verifyCatalogScope({
    departmentIds: (links ?? []).map((l) => l.department_id as string),
    isGlobal: apartado.is_global as boolean,
  });
}

export async function uploadApartadoTemplate(input: {
  apartadoId: string;
  fileName: string;
  fileBase64: string;
  mimeType: string;
}): Promise<ApartadoTemplateFile> {
  await requireAdmin();
  await ensureManageCatalogForApartado(input.apartadoId);
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
  const admin = createAdminClient();
  const { data: t } = await admin
    .schema("documentation")
    .from("apartado_templates")
    .select("apartado_id, storage_path")
    .eq("id", templateId)
    .single();
  if (!t) throw new Error("Plantilla no encontrada");
  await ensureManageCatalogForApartado(t.apartado_id as string);

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
