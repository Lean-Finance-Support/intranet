"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission, userScopeIds } from "@/lib/require-permission";
import { fetchSupervisorCompanyIds } from "@/lib/team-queries";

/**
 * Valida que el admin autenticado tiene scope sobre `companyId`. Lanza
 * "Sin permisos" si no.
 *
 * Tienen acceso (need-to-know):
 *  - Backoffice: tiene `manage_client_accounts` global. Atajo, ve todo.
 *  - Técnico: `write_assigned_company` sobre algún `company_service` de la empresa.
 *  - Miembro/Chief/Operador/Observador de un dpto: `read_dept_service` sobre
 *    algún dpto que cubre algún servicio contratado por la empresa.
 *  - Supervisor de algún apartado de documentación de la empresa.
 *
 * La autorización se evalúa contra permisos atómicos (no contra nombres de
 * rol) — así nuevos roles que reciban estos permisos heredan el acceso
 * automáticamente sin tener que tocar este helper.
 *
 * Devuelve `{ supabase, user }` como `requireAdmin()` para encadenar el resto
 * de la server action sin rehacer auth.
 */
export async function requireCompanyAccess(companyId: string) {
  const { supabase, user } = await requireAdmin();
  if (!companyId) throw new Error("Sin permisos");

  // Atajo: Backoffice (manage_client_accounts global) ve todo.
  if (await hasPermission("manage_client_accounts")) return { supabase, user };

  const admin = createAdminClient();

  // Servicios contratados (activos) por la empresa.
  const { data: companyServices } = await admin
    .from("company_services")
    .select("id, service_id")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const csRows = (companyServices ?? []) as { id: string; service_id: string }[];
  const csIds = csRows.map((r) => r.id);
  const serviceIds = csRows.map((r) => r.service_id);

  // 1) Técnico: tiene write_assigned_company sobre algún company_service de la empresa.
  if (csIds.length > 0) {
    const userTechCsIds = await userScopeIds("write_assigned_company", "company_service");
    const csSet = new Set(csIds);
    if (userTechCsIds.some((id) => csSet.has(id))) return { supabase, user };
  }

  // 2) Miembro/Chief/Operador/Observador de un dpto que cubre algún servicio
  //    contratado. read_dept_service es el permiso común a todos esos roles.
  if (serviceIds.length > 0) {
    const { data: deptSvcLinks } = await admin
      .from("department_services")
      .select("department_id")
      .in("service_id", serviceIds)
      .eq("is_active", true);

    const deptSvcRows = (deptSvcLinks ?? []) as { department_id: string }[];
    const deptIds = new Set(deptSvcRows.map((d) => d.department_id));

    if (deptIds.size > 0) {
      const userReadDeptIds = await userScopeIds("read_dept_service", "department");
      if (userReadDeptIds.some((id) => deptIds.has(id))) return { supabase, user };
    }
  }

  // 3) Supervisor de algún apartado de doc de la empresa.
  const supervisorCompanyIds = await fetchSupervisorCompanyIds(admin, user.id);
  if (supervisorCompanyIds.has(companyId)) return { supabase, user };

  throw new Error("Sin permisos");
}

/**
 * Variante para gating de descargas: deriva `companyId` a partir del
 * `apartado_files.id` (vía `client_apartados → client_blocks`) y delega en
 * `requireCompanyAccess`.
 */
export async function requireCompanyAccessByFile(fileId: string) {
  if (!fileId) throw new Error("Sin permisos");
  const admin = createAdminClient();

  const { data: file } = await admin
    .schema("documentation")
    .from("apartado_files")
    .select("client_apartado_id")
    .eq("id", fileId)
    .single();
  const clientApartadoId = file?.client_apartado_id as string | null;
  if (!clientApartadoId) throw new Error("Archivo no encontrado");

  const { data: clientApartado } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("client_block_id")
    .eq("id", clientApartadoId)
    .single();
  const clientBlockId = clientApartado?.client_block_id as string | null;
  if (!clientBlockId) throw new Error("Archivo no encontrado");

  const { data: block } = await admin
    .schema("documentation")
    .from("client_blocks")
    .select("company_id")
    .eq("id", clientBlockId)
    .single();
  const companyId = block?.company_id as string | null;
  if (!companyId) throw new Error("Archivo no encontrado");

  return requireCompanyAccess(companyId);
}
