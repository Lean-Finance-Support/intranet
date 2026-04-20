"use server";

import { getAuthUser } from "@/lib/cached-queries";

export type PermissionScope =
  | { type: "none" }
  | { type: "department"; id: string }
  | { type: "company"; id: string }
  | { type: "service"; id: string }
  | { type: "company_service"; companyServiceId: string };

function scopeArgs(scope: PermissionScope) {
  switch (scope.type) {
    case "none":
      return { p_scope_type: "none", p_scope_id: null };
    case "department":
      return { p_scope_type: "department", p_scope_id: scope.id };
    case "company":
      return { p_scope_type: "company", p_scope_id: scope.id };
    case "service":
      return { p_scope_type: "service", p_scope_id: scope.id };
    case "company_service":
      return { p_scope_type: "company_service", p_scope_id: scope.companyServiceId };
  }
}

export async function hasPermission(
  perm: string,
  scope: PermissionScope = { type: "none" }
): Promise<boolean> {
  const { supabase, user } = await getAuthUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("has_permission", {
    uid: user.id,
    perm,
    ...scopeArgs(scope),
  });

  if (error) throw error;
  return data === true;
}

export async function requirePermission(
  perm: string,
  scope: PermissionScope = { type: "none" }
) {
  const { supabase, user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  const { data, error } = await supabase.rpc("has_permission", {
    uid: user.id,
    perm,
    ...scopeArgs(scope),
  });

  if (error) throw error;
  if (data !== true) throw new Error("Sin permisos");

  return { supabase, user };
}

/**
 * Devuelve los scope_ids (por ejemplo, departamentos) en los que el usuario
 * actual tiene un permiso determinado.
 */
export async function userScopeIds(
  perm: string,
  scopeType: "department" | "company" | "service" | "company_service"
): Promise<string[]> {
  const { supabase, user } = await getAuthUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("user_scope_ids", {
    uid: user.id,
    perm,
    p_scope_type: scopeType,
  });

  if (error) throw error;
  return (data ?? []).map((row: { scope_id: string }) => row.scope_id);
}

export async function requireAnyPermission(
  perms: Array<{ perm: string; scope?: PermissionScope }>
) {
  for (const { perm, scope } of perms) {
    if (await hasPermission(perm, scope ?? { type: "none" })) {
      const { supabase, user } = await getAuthUser();
      return { supabase, user };
    }
  }
  throw new Error("Sin permisos");
}

export type GrantLevel = 0 | 1 | 2 | 3;

export async function userGrantLevel(
  perm: string,
  scope: PermissionScope = { type: "none" }
): Promise<GrantLevel> {
  const { supabase, user } = await getAuthUser();
  if (!user) return 0;

  const { data, error } = await supabase.rpc("user_grant_level", {
    uid: user.id,
    perm,
    ...scopeArgs(scope),
  });

  if (error) throw error;
  const n = Number(data ?? 0);
  return (n >= 0 && n <= 3 ? n : 0) as GrantLevel;
}

export async function canGrantToLevel(
  perm: string,
  scope: PermissionScope,
  targetLevel: 1 | 2
): Promise<boolean> {
  const { supabase, user } = await getAuthUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("can_grant_to_level", {
    uid: user.id,
    perm,
    ...scopeArgs(scope),
    target_level: targetLevel,
  });

  if (error) throw error;
  return data === true;
}
