"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission } from "@/lib/require-permission";
import {
  LOAD_BEARING_SERVICE_SLUGS,
  type ServiceCatalogItem,
} from "@/lib/types/services";

// La lectura del catálogo es libre para cualquier admin (lo gestiona la UI
// renderizando los botones de mutación solo si `canManage`). Las mutaciones
// requieren `manage_services_catalog` (global, grantable).

async function requireManageServicesCatalog(): Promise<void> {
  if (!(await hasPermission("manage_services_catalog"))) {
    throw new Error("Sin permisos");
  }
}

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertSlug(slug: string): void {
  if (!slug || !SLUG_REGEX.test(slug)) {
    throw new Error("Slug inválido. Solo minúsculas, números y guiones.");
  }
}

// ============================================================================
// Lectura del catálogo
// ============================================================================

export async function listServicesCatalog(): Promise<{
  services: ServiceCatalogItem[];
  departments: { id: string; name: string }[];
  canManage: boolean;
}> {
  const { supabase } = await requireAdmin();

  const [
    { data: services },
    { data: deptLinks },
    { data: departments },
    { data: companyServices },
  ] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, slug, description, is_active, display_order, created_at, updated_at")
      .order("display_order")
      .order("name"),
    supabase
      .from("department_services")
      .select("service_id, department_id")
      .eq("is_active", true),
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("company_services")
      .select("service_id")
      .eq("is_active", true),
  ]);

  const deptNameById = new Map<string, string>();
  for (const d of departments ?? []) {
    deptNameById.set(d.id as string, d.name as string);
  }

  const deptIdsByService = new Map<string, string[]>();
  for (const link of deptLinks ?? []) {
    const sid = link.service_id as string;
    const list = deptIdsByService.get(sid) ?? [];
    list.push(link.department_id as string);
    deptIdsByService.set(sid, list);
  }

  const countByService = new Map<string, number>();
  for (const cs of companyServices ?? []) {
    const sid = cs.service_id as string;
    countByService.set(sid, (countByService.get(sid) ?? 0) + 1);
  }

  const items: ServiceCatalogItem[] = (services ?? []).map((s) => {
    const sid = s.id as string;
    const deptIds = deptIdsByService.get(sid) ?? [];
    return {
      id: sid,
      name: s.name as string,
      slug: s.slug as string,
      description: (s.description as string | null) ?? null,
      is_active: s.is_active as boolean,
      display_order: s.display_order as number,
      created_at: s.created_at as string,
      updated_at: s.updated_at as string,
      department_ids: deptIds,
      department_names: deptIds
        .map((id) => deptNameById.get(id) ?? "")
        .filter((n) => n.length > 0),
      company_count: countByService.get(sid) ?? 0,
      is_load_bearing: LOAD_BEARING_SERVICE_SLUGS.has(s.slug as string),
    };
  });

  const canManage = await hasPermission("manage_services_catalog");

  return {
    services: items,
    departments: (departments ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
    })),
    canManage,
  };
}

// ============================================================================
// Mutaciones
// ============================================================================

export interface ServiceCatalogInput {
  name: string;
  slug: string;
  description: string | null;
  department_ids: string[];
  display_order: number;
}

async function ensureSlugUnique(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  slug: string,
  excludeId: string | null
): Promise<void> {
  let query = supabase.from("services").select("id").eq("slug", slug);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  if (data) throw new Error(`Ya existe un servicio con el slug "${slug}".`);
}

export async function createService(input: ServiceCatalogInput): Promise<{ id: string }> {
  await requireAdmin();
  await requireManageServicesCatalog();

  const name = input.name.trim();
  if (!name) throw new Error("El nombre es obligatorio.");
  const slug = normalizeSlug(input.slug || input.name);
  assertSlug(slug);

  const { supabase: writeClient } = await requireAdmin();
  await ensureSlugUnique(writeClient, slug, null);

  const { data: created, error: insertErr } = await writeClient
    .from("services")
    .insert({
      name,
      slug,
      description: input.description?.trim() || null,
      display_order: Number.isFinite(input.display_order) ? input.display_order : 100,
      is_active: true,
    })
    .select("id")
    .single();
  if (insertErr || !created) {
    throw new Error("Error al crear el servicio.");
  }

  const serviceId = created.id as string;
  const deptIds = uniq(input.department_ids);
  if (deptIds.length > 0) {
    const rows = deptIds.map((department_id) => ({
      service_id: serviceId,
      department_id,
      is_active: true,
    }));
    const { error: linkErr } = await writeClient
      .from("department_services")
      .upsert(rows, { onConflict: "department_id,service_id" });
    if (linkErr) throw new Error("Error al vincular departamentos al servicio.");
  }

  revalidatePath("/admin/servicios");
  revalidatePath("/admin/clientes/onboarding");
  return { id: serviceId };
}

export interface ServiceCatalogUpdate extends Partial<ServiceCatalogInput> {
  is_active?: boolean;
}

export async function updateService(
  id: string,
  fields: ServiceCatalogUpdate
): Promise<void> {
  await requireAdmin();
  await requireManageServicesCatalog();

  const { supabase } = await requireAdmin();

  const { data: existing } = await supabase
    .from("services")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();
  if (!existing) throw new Error("Servicio no encontrado.");

  const existingSlug = existing.slug as string;
  const isLoadBearing = LOAD_BEARING_SERVICE_SLUGS.has(existingSlug);

  const updates: Record<string, unknown> = {};

  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name) throw new Error("El nombre es obligatorio.");
    updates.name = name;
  }

  if (fields.slug !== undefined) {
    const nextSlug = normalizeSlug(fields.slug);
    if (nextSlug !== existingSlug) {
      if (isLoadBearing) {
        throw new Error("Este slug está referenciado en código y no se puede cambiar.");
      }
      assertSlug(nextSlug);
      await ensureSlugUnique(supabase, nextSlug, id);
      updates.slug = nextSlug;
    }
  }

  if (fields.description !== undefined) {
    updates.description = fields.description?.trim() || null;
  }

  if (fields.display_order !== undefined && Number.isFinite(fields.display_order)) {
    updates.display_order = fields.display_order;
  }

  if (fields.is_active !== undefined) {
    if (isLoadBearing && fields.is_active === false) {
      throw new Error("No se puede archivar un servicio referenciado en código.");
    }
    updates.is_active = fields.is_active;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("services").update(updates).eq("id", id);
    if (error) throw new Error("Error al actualizar el servicio.");
  }

  if (fields.department_ids !== undefined) {
    const nextDeptIds = new Set(uniq(fields.department_ids));
    const { data: currentLinks } = await supabase
      .from("department_services")
      .select("department_id, is_active")
      .eq("service_id", id);

    const currentActiveDeptIds = new Set(
      (currentLinks ?? [])
        .filter((l) => l.is_active === true)
        .map((l) => l.department_id as string)
    );

    const toDeactivate = [...currentActiveDeptIds].filter((d) => !nextDeptIds.has(d));
    const toUpsert = [...nextDeptIds]; // upsert con is_active=true (reactiva los existentes inactivos)

    if (toDeactivate.length > 0) {
      const { error: deErr } = await supabase
        .from("department_services")
        .update({ is_active: false })
        .eq("service_id", id)
        .in("department_id", toDeactivate);
      if (deErr) throw new Error("Error al desvincular departamentos.");
    }

    if (toUpsert.length > 0) {
      const rows = toUpsert.map((department_id) => ({
        service_id: id,
        department_id,
        is_active: true,
      }));
      const { error: upErr } = await supabase
        .from("department_services")
        .upsert(rows, { onConflict: "department_id,service_id" });
      if (upErr) throw new Error("Error al vincular departamentos.");
    }
  }

  revalidatePath("/admin/servicios");
  revalidatePath("/admin/clientes/onboarding");
}

export async function archiveService(id: string): Promise<void> {
  await requireAdmin();
  await requireManageServicesCatalog();

  const { supabase } = await requireAdmin();

  const { data: existing } = await supabase
    .from("services")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  if (!existing) throw new Error("Servicio no encontrado.");
  if (LOAD_BEARING_SERVICE_SLUGS.has(existing.slug as string)) {
    throw new Error("No se puede archivar un servicio referenciado en código.");
  }

  const { count } = await supabase
    .from("company_services")
    .select("id", { count: "exact", head: true })
    .eq("service_id", id)
    .eq("is_active", true);

  if ((count ?? 0) > 0) {
    throw new Error(
      `No se puede archivar: ${count} empresa(s) lo tienen contratado. Quítaselo primero.`
    );
  }

  const { error } = await supabase
    .from("services")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw new Error("Error al archivar el servicio.");

  revalidatePath("/admin/servicios");
  revalidatePath("/admin/clientes/onboarding");
}

export async function unarchiveService(id: string): Promise<void> {
  await requireAdmin();
  await requireManageServicesCatalog();

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("services")
    .update({ is_active: true })
    .eq("id", id);
  if (error) throw new Error("Error al reactivar el servicio.");

  revalidatePath("/admin/servicios");
  revalidatePath("/admin/clientes/onboarding");
}

// ----------------------------------------------------------------------------

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
