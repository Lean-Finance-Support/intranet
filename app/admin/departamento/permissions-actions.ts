"use server";

import { requireAdmin } from "@/lib/require-admin";
import { canGrantToLevel, userGrantLevel } from "@/lib/require-permission";
import type { PermissionScope } from "@/lib/require-permission";
import { ROLE_PERMISSIONS } from "@/lib/role-catalog";
import { revalidatePath } from "next/cache";

/**
 * Borra los profile_permissions directos que quedan redundantes al otorgar un
 * rol: mismos permisos, mismo scope, con grant_level ≤ al nivel del rol.
 * Los grants con nivel superior al rol se conservan (son estrictamente más
 * poder que el rol).
 *
 * Es un no-op cuando los permisos del rol no son grantables (caso de roles
 * scoped a dept: member_of_department, read/write_dept_service, etc.).
 */
async function cleanupDirectGrantsCoveredByRole(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  targetProfileId: string,
  roleName: string,
  scope: { type: "none" } | { type: "department"; id: string } | { type: "company_service"; id: string },
  level: 1 | 2 | 3
): Promise<void> {
  const perms = ROLE_PERMISSIONS[roleName] ?? [];
  if (perms.length === 0) return;

  let query = supabase
    .from("profile_permissions")
    .delete()
    .eq("profile_id", targetProfileId)
    .in("permission_code", perms)
    .lte("grant_level", level);

  if (scope.type === "none") {
    query = query.eq("scope_type", "none").is("scope_id", null);
  } else {
    query = query.eq("scope_type", scope.type).eq("scope_id", scope.id);
  }

  const { error } = await query;
  if (error) {
    // No abortamos el flujo superior — el rol ya se asignó; solo logueamos.
    console.error(
      `[admin/equipo] cleanupDirectGrantsCoveredByRole(${roleName}) error:`,
      error.code
    );
  }
}

type GrantScopeInput =
  | { type: "none" }
  | { type: "department"; id: string };

export interface CurrentUserDelegation {
  perm_code: string;
  scope_type: "none" | "department";
  scope_id: string | null;
  max_target_level: 1 | 2; // nivel máximo que puede otorgar
}

export interface MemberGrantRow {
  perm_code: string;
  scope_type: "none" | "department";
  scope_id: string | null;
  grant_level: 1 | 2 | 3;
}

// Qué puede delegar el usuario actual, agrupado por (perm, scope).
// Considera tanto grants directos (profile_permissions) como heredados vía
// roles (profile_roles). max_target_level = user_grant_level - 1, cap en 2.
export async function getCurrentUserDelegations(): Promise<CurrentUserDelegation[]> {
  const { supabase, user } = await requireAdmin();

  const { data, error } = await supabase.rpc("current_user_delegations", {
    uid: user.id,
  });

  if (error) {
    console.error("[admin/equipo] getCurrentUserDelegations error:", error.code);
    return [];
  }

  return (data ?? [])
    .filter(
      (row: { scope_type: string }) =>
        row.scope_type === "none" || row.scope_type === "department"
    )
    .map((row: {
      permission_code: string;
      scope_type: string;
      scope_id: string | null;
      grant_level: number;
    }) => {
      const lvl = Number(row.grant_level);
      const maxTarget = Math.min(2, lvl - 1) as 1 | 2;
      return {
        perm_code: row.permission_code,
        scope_type: row.scope_type as "none" | "department",
        scope_id: row.scope_id ?? null,
        max_target_level: maxTarget,
      };
    });
}

// Permisos grantables directos (profile_permissions) que tiene un miembro.
// Incluye N3 para mostrar el badge, pero se bloquea su edición en UI y RLS.
export async function getMemberGrants(targetProfileId: string): Promise<MemberGrantRow[]> {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("profile_permissions")
    .select("permission_code, scope_type, scope_id, grant_level, permissions!inner(is_grantable)")
    .eq("profile_id", targetProfileId);

  if (error) {
    console.error("[admin/equipo] getMemberGrants error:", error.code);
    return [];
  }

  return (data ?? [])
    .filter((row) => {
      const perm = row.permissions as unknown as { is_grantable: boolean } | null;
      return perm?.is_grantable === true;
    })
    .filter((row) => row.scope_type === "none" || row.scope_type === "department")
    .map((row) => ({
      perm_code: row.permission_code,
      scope_type: row.scope_type as "none" | "department",
      scope_id: row.scope_id ?? null,
      grant_level: Math.max(1, Math.min(3, Number(row.grant_level ?? 1))) as 1 | 2 | 3,
    }));
}

function toPermissionScope(scope: GrantScopeInput): PermissionScope {
  if (scope.type === "none") return { type: "none" };
  return { type: "department", id: scope.id };
}

function toDbScope(scope: GrantScopeInput): { scope_type: string; scope_id: string | null } {
  if (scope.type === "none") return { scope_type: "none", scope_id: null };
  return { scope_type: "department", scope_id: scope.id };
}

export async function grantPermission(
  targetProfileId: string,
  perm: string,
  scope: GrantScopeInput,
  level: 1 | 2
): Promise<void> {
  if (level !== 1 && level !== 2) {
    throw new Error("Solo se pueden otorgar niveles 1 o 2 desde la UI.");
  }

  const canGrant = await canGrantToLevel(perm, toPermissionScope(scope), level);
  if (!canGrant) throw new Error("No tienes nivel suficiente para otorgar este permiso.");

  const { supabase } = await requireAdmin();
  const dbScope = toDbScope(scope);

  // Check if already exists (NULLS NOT DISTINCT en la UNIQUE trata NULL como igual,
  // pero PostgREST no aplica esa semántica con .is() → resolvemos en dos pasos).
  let readQuery = supabase
    .from("profile_permissions")
    .select("id, grant_level")
    .eq("profile_id", targetProfileId)
    .eq("permission_code", perm)
    .eq("scope_type", dbScope.scope_type);
  readQuery = dbScope.scope_id === null
    ? readQuery.is("scope_id", null)
    : readQuery.eq("scope_id", dbScope.scope_id);
  const { data: existing, error: readErr } = await readQuery.maybeSingle();

  if (readErr) {
    console.error("[admin/equipo] grantPermission read error:", readErr.code);
    throw new Error("No se pudo leer el permiso.");
  }

  if (existing) {
    // No permitir tocar N3 desde UI (RLS también lo rechaza, defensa en profundidad)
    if (existing.grant_level === 3) {
      throw new Error("Los permisos N3 solo pueden modificarse por SQL.");
    }
    const { error } = await supabase
      .from("profile_permissions")
      .update({ grant_level: level })
      .eq("id", existing.id);
    if (error) {
      console.error("[admin/equipo] grantPermission update error:", error.code, error.message);
      throw new Error("No se pudo actualizar el permiso.");
    }
  } else {
    const { error } = await supabase.from("profile_permissions").insert({
      profile_id: targetProfileId,
      permission_code: perm,
      scope_type: dbScope.scope_type,
      scope_id: dbScope.scope_id,
      grant_level: level,
    });
    if (error) {
      console.error("[admin/equipo] grantPermission insert error:", error.code, error.message);
      throw new Error("No se pudo otorgar el permiso.");
    }
  }

  revalidatePath("/admin/departamento");
}

// ---------- Roles directos del empleado (para mostrar en la ficha) ----------

export interface MemberRoleAssignment {
  role_name: string;
  scope_type: "none" | "department";
  scope_id: string | null;
  scope_label: string | null; // nombre del depto si aplica
  grant_level: 1 | 2 | 3;
}

export async function getMemberRoleAssignments(
  targetProfileId: string
): Promise<MemberRoleAssignment[]> {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("profile_roles")
    .select("scope_type, scope_id, grant_level, role:roles!inner(name)")
    .eq("profile_id", targetProfileId)
    .neq("scope_type", "company_service"); // Técnico fuera: no se muestra en la ficha

  if (error) {
    console.error("[admin/equipo] getMemberRoleAssignments error:", error.code);
    return [];
  }

  // Resolver nombres de departamento en un segundo paso
  const deptIds = [
    ...new Set(
      (data ?? [])
        .filter((r) => r.scope_type === "department" && r.scope_id)
        .map((r) => r.scope_id as string)
    ),
  ];
  const deptNames = new Map<string, string>();
  if (deptIds.length > 0) {
    const { data: depts } = await supabase
      .from("departments")
      .select("id, name")
      .in("id", deptIds);
    for (const d of depts ?? []) deptNames.set(d.id as string, d.name as string);
  }

  return (data ?? []).map((row) => {
    const role = row.role as unknown as { name: string } | null;
    const scope_type = row.scope_type as "none" | "department";
    const scope_id = (row.scope_id as string | null) ?? null;
    const level = Math.max(1, Math.min(3, Number(row.grant_level ?? 1))) as 1 | 2 | 3;
    return {
      role_name: role?.name ?? "",
      scope_type,
      scope_id,
      scope_label:
        scope_type === "department" && scope_id ? deptNames.get(scope_id) ?? null : null,
      grant_level: level,
    };
  });
}

// ---------- Rol Backoffice (otorgar/revocar desde la ficha) ----------

// Nivel máximo al que el usuario actual puede otorgar el rol Backoffice.
// 0 = no puede otorgarlo. 1 = puede otorgar N1. 2 = puede otorgar N1 o N2.
// N3 nunca se otorga desde UI (bootstrap SQL).
export async function backofficeGrantMaxLevel(): Promise<0 | 1 | 2> {
  const [edit, clients, banks] = await Promise.all([
    userGrantLevel("edit_company_info", { type: "none" }),
    userGrantLevel("manage_client_accounts", { type: "none" }),
    userGrantLevel("manage_bank_accounts", { type: "none" }),
  ]);
  const min = Math.min(edit, clients, banks);
  // Para otorgar target_level necesitas user_grant_level >= target_level + 1
  return Math.min(2, Math.max(0, min - 1)) as 0 | 1 | 2;
}

export async function canGrantBackofficeRole(): Promise<boolean> {
  return (await backofficeGrantMaxLevel()) >= 1;
}

async function getBackofficeRoleId(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"]
): Promise<string> {
  const { data } = await supabase.from("roles").select("id").eq("name", "Backoffice").maybeSingle();
  if (!data) throw new Error("Rol 'Backoffice' no encontrado.");
  return data.id as string;
}

export async function grantBackofficeRole(
  targetProfileId: string,
  level: 1 | 2 = 1
): Promise<void> {
  if (level !== 1 && level !== 2) {
    throw new Error("Solo se pueden otorgar niveles 1 o 2 desde la UI.");
  }
  const maxLevel = await backofficeGrantMaxLevel();
  if (maxLevel < level) {
    throw new Error("No tienes nivel suficiente para otorgar Backoffice a ese nivel.");
  }

  const { supabase } = await requireAdmin();
  const roleId = await getBackofficeRoleId(supabase);

  // Upsert: si ya existe con otro nivel, actualizar; si no, insertar.
  const { data: existing } = await supabase
    .from("profile_roles")
    .select("id, grant_level")
    .eq("profile_id", targetProfileId)
    .eq("role_id", roleId)
    .eq("scope_type", "none")
    .is("scope_id", null)
    .maybeSingle();

  if (existing) {
    if (existing.grant_level === 3) {
      throw new Error("Un rol N3 solo puede modificarse por SQL.");
    }
    const { error } = await supabase
      .from("profile_roles")
      .update({ grant_level: level })
      .eq("id", existing.id);
    if (error) {
      console.error("[admin/equipo] grantBackofficeRole update error:", error.code);
      throw new Error("No se pudo actualizar el rol Backoffice.");
    }
  } else {
    const { error } = await supabase.from("profile_roles").insert({
      profile_id: targetProfileId,
      role_id: roleId,
      scope_type: "none",
      scope_id: null,
      grant_level: level,
    });
    if (error && error.code !== "23505") {
      console.error("[admin/equipo] grantBackofficeRole insert error:", error.code, error.message);
      throw new Error("No se pudo otorgar el rol Backoffice.");
    }
  }

  await cleanupDirectGrantsCoveredByRole(
    supabase,
    targetProfileId,
    "Backoffice",
    { type: "none" },
    level
  );

  revalidatePath("/admin/departamento");
}

export async function revokeBackofficeRole(targetProfileId: string): Promise<void> {
  if (!(await canGrantBackofficeRole())) {
    throw new Error("No tienes nivel suficiente para revocar Backoffice.");
  }

  const { supabase } = await requireAdmin();
  const roleId = await getBackofficeRoleId(supabase);

  const { error } = await supabase
    .from("profile_roles")
    .delete()
    .eq("profile_id", targetProfileId)
    .eq("role_id", roleId)
    .eq("scope_type", "none")
    .is("scope_id", null);
  if (error) {
    console.error("[admin/equipo] revokeBackofficeRole error:", error.code);
    throw new Error("No se pudo revocar el rol Backoffice.");
  }

  revalidatePath("/admin/departamento");
}

export async function revokePermission(
  targetProfileId: string,
  perm: string,
  scope: GrantScopeInput
): Promise<void> {
  const { supabase } = await requireAdmin();

  // Leemos el nivel actual para validar que el actor puede revocarlo
  const dbScope = toDbScope(scope);
  let readQuery = supabase
    .from("profile_permissions")
    .select("grant_level")
    .eq("profile_id", targetProfileId)
    .eq("permission_code", perm)
    .eq("scope_type", dbScope.scope_type);
  readQuery = dbScope.scope_id === null
    ? readQuery.is("scope_id", null)
    : readQuery.eq("scope_id", dbScope.scope_id);
  const { data: existing, error: readErr } = await readQuery.maybeSingle();

  if (readErr) {
    console.error("[admin/equipo] revokePermission read error:", readErr.code);
    throw new Error("No se pudo leer el permiso.");
  }

  if (!existing) return; // nada que revocar

  const currentLevel = Number(existing.grant_level ?? 1) as 1 | 2 | 3;
  if (currentLevel === 3) {
    throw new Error("Los permisos N3 solo pueden revocarse por SQL.");
  }

  const canRevoke = await canGrantToLevel(
    perm,
    toPermissionScope(scope),
    currentLevel as 1 | 2
  );
  if (!canRevoke) throw new Error("No tienes nivel suficiente para revocar este permiso.");

  let query = supabase
    .from("profile_permissions")
    .delete()
    .eq("profile_id", targetProfileId)
    .eq("permission_code", perm)
    .eq("scope_type", dbScope.scope_type);

  query = dbScope.scope_id === null
    ? query.is("scope_id", null)
    : query.eq("scope_id", dbScope.scope_id);

  const { error } = await query;

  if (error) {
    console.error("[admin/equipo] revokePermission delete error:", error.code);
    throw new Error("No se pudo revocar el permiso.");
  }

  revalidatePath("/admin/departamento");
}
