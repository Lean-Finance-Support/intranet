"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission } from "@/lib/require-permission";
import { fetchSupervisorCompanyIds } from "@/lib/team-queries";

/**
 * Valida que el admin autenticado tiene scope sobre `companyId`. Lanza
 * "Sin permisos" si no.
 *
 * Tienen acceso (need-to-know):
 *  - Backoffice (`manage_users` global) — soporte/superadmin.
 *  - Técnico de algún servicio contratado por la empresa.
 *  - Miembro o Chief de un departamento que cubre algún servicio contratado.
 *  - Supervisor de algún apartado de documentación de la empresa.
 *
 * Devuelve `{ supabase, user }` como `requireAdmin()` para encadenar el resto
 * de la server action sin rehacer auth.
 */
export async function requireCompanyAccess(companyId: string) {
  const { supabase, user } = await requireAdmin();
  if (!companyId) throw new Error("Sin permisos");

  // Atajo: Backoffice ve todo.
  if (await hasPermission("manage_users")) return { supabase, user };

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

  // 1) Técnico de algún company_service de la empresa.
  if (csIds.length > 0) {
    const { data: techRoleMatches } = await admin
      .from("profile_roles")
      .select("scope_id, role:roles!inner(name)")
      .eq("profile_id", user.id)
      .eq("scope_type", "company_service")
      .in("scope_id", csIds);

    const techRows = (techRoleMatches ?? []) as unknown as {
      scope_id: string;
      role: { name: string } | null;
    }[];
    const isTech = techRows.some((r) => r.role?.name === "Técnico");
    if (isTech) return { supabase, user };
  }

  // 2) Miembro/Chief de un dpto que cubre algún servicio contratado.
  if (serviceIds.length > 0) {
    const { data: deptSvcLinks } = await admin
      .from("department_services")
      .select("department_id")
      .in("service_id", serviceIds)
      .eq("is_active", true);

    const deptSvcRows = (deptSvcLinks ?? []) as { department_id: string }[];
    const deptIds = [...new Set(deptSvcRows.map((d) => d.department_id))];

    if (deptIds.length > 0) {
      const { data: deptRoleMatches } = await admin
        .from("profile_roles")
        .select("scope_id, role:roles!inner(name)")
        .eq("profile_id", user.id)
        .eq("scope_type", "department")
        .in("scope_id", deptIds);

      const deptRows = (deptRoleMatches ?? []) as unknown as {
        scope_id: string;
        role: { name: string } | null;
      }[];
      const isDeptMember = deptRows.some((r) => {
        const name = r.role?.name;
        return name === "Miembro de departamento" || name === "Chief";
      });
      if (isDeptMember) return { supabase, user };
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
