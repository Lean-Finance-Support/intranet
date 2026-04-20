"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { DeptMember } from "@/app/admin/departamento/actions";
import { removeDeptMember } from "@/app/admin/departamento/actions";
import type {
  CurrentUserDelegation,
  MemberGrantRow,
  MemberRoleAssignment,
} from "@/app/admin/departamento/permissions-actions";
import {
  getMemberGrants,
  getMemberRoleAssignments,
  revokeBackofficeRole,
  revokePermission,
} from "@/app/admin/departamento/permissions-actions";
import { getGrantablePermission } from "@/lib/permission-catalog";
import { ROLE_PERMISSIONS, permLabel } from "@/lib/role-catalog";
import AddPermissionModal from "@/components/team/add-permission-modal";
import AddRoleModal, { type AvailableRole } from "@/components/team/add-role-modal";

interface DrawerProps {
  member: DeptMember;
  delegations: CurrentUserDelegation[];
  departments: { id: string; name: string }[];
  manageMembershipDeptIds: string[];
  backofficeMaxLevel: 0 | 1 | 2;
  onClose: () => void;
  onMutated?: () => void;
}

type GrantScope = { type: "none" } | { type: "department"; id: string };
type DeptRoleKind = "miembro" | "operador" | "observador";

function roleNameToKind(name: string): DeptRoleKind | null {
  if (name === "Miembro de departamento") return "miembro";
  if (name === "Operador") return "operador";
  if (name === "Observador") return "observador";
  return null;
}

export default function MemberPermissionsDrawer({
  member,
  delegations,
  departments,
  manageMembershipDeptIds,
  backofficeMaxLevel,
  onClose,
  onMutated,
}: DrawerProps) {
  const canGrantBackoffice = backofficeMaxLevel >= 1;
  const [expandedRoleIdx, setExpandedRoleIdx] = useState<number | null>(null);
  const manageMembershipSet = useMemo(
    () => new Set(manageMembershipDeptIds),
    [manageMembershipDeptIds]
  );
  const [roleAssignments, setRoleAssignments] = useState<MemberRoleAssignment[]>([]);
  const [grants, setGrants] = useState<MemberGrantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const [showAddPermModal, setShowAddPermModal] = useState(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending && !showAddPermModal && !showAddRoleModal) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending, showAddPermModal, showAddRoleModal]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMemberGrants(member.id), getMemberRoleAssignments(member.id)])
      .then(([grantRows, roleRows]) => {
        if (cancelled) return;
        setGrants(grantRows);
        setRoleAssignments(roleRows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error cargando la ficha");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  async function reloadAll() {
    const [grantRows, roleRows] = await Promise.all([
      getMemberGrants(member.id),
      getMemberRoleAssignments(member.id),
    ]);
    setGrants(grantRows);
    setRoleAssignments(roleRows);
  }

  const deptNameById = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments]
  );

  // --------- Roles: helpers ---------
  const hasBackoffice = roleAssignments.some(
    (r) => r.role_name === "Backoffice" && r.scope_type === "none"
  );

  const availableRolesToGrant: AvailableRole[] = useMemo(() => {
    const list: AvailableRole[] = [];
    if (backofficeMaxLevel >= 1 && !hasBackoffice) {
      list.push({
        key: "backoffice",
        label: "Backoffice",
        maxLevel: backofficeMaxLevel as 1 | 2,
      });
    }
    return list;
  }, [backofficeMaxLevel, hasBackoffice]);

  function canRevokeRole(r: MemberRoleAssignment): boolean {
    if (r.role_name === "Backoffice" && r.scope_type === "none") return canGrantBackoffice;
    if (r.role_name === "Chief") return false;
    const kind = roleNameToKind(r.role_name);
    if (!kind || r.scope_type !== "department" || !r.scope_id) return false;
    return manageMembershipSet.has(r.scope_id);
  }

  function handleRevokeRole(r: MemberRoleAssignment) {
    setError("");
    if (r.role_name === "Backoffice" && r.scope_type === "none") {
      startTransition(async () => {
        try {
          await revokeBackofficeRole(member.id);
          await reloadAll();
          onMutated?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Error al revocar rol");
        }
      });
      return;
    }
    const kind = roleNameToKind(r.role_name);
    if (!kind || r.scope_type !== "department" || !r.scope_id) return;
    const deptId = r.scope_id;
    startTransition(async () => {
      try {
        await removeDeptMember(member.id, deptId, kind);
        await reloadAll();
        onMutated?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al quitar del departamento");
      }
    });
  }

  // --------- Permisos: helpers ---------
  const delegationByPerm = useMemo(() => {
    const map = new Map<string, CurrentUserDelegation[]>();
    for (const d of delegations) {
      const list = map.get(d.perm_code) ?? [];
      list.push(d);
      map.set(d.perm_code, list);
    }
    return map;
  }, [delegations]);

  const hasAnyPermToGrant = useMemo(() => {
    if (delegations.length === 0) return false;
    const held = new Set<string>();
    for (const g of grants) {
      held.add(`${g.perm_code}::${g.scope_type}::${g.scope_id ?? ""}`);
    }
    for (const r of roleAssignments) {
      const perms = ROLE_PERMISSIONS[r.role_name] ?? [];
      for (const code of perms) {
        held.add(`${code}::${r.scope_type}::${r.scope_id ?? ""}`);
      }
    }
    return delegations.some(
      (d) => !held.has(`${d.perm_code}::${d.scope_type}::${d.scope_id ?? ""}`)
    );
  }, [delegations, grants, roleAssignments]);

  function handleRevokePermission(row: MemberGrantRow) {
    setError("");
    const scope: GrantScope =
      row.scope_type === "none"
        ? { type: "none" }
        : { type: "department", id: row.scope_id! };
    startTransition(async () => {
      try {
        await revokePermission(member.id, row.perm_code, scope);
        const fresh = await getMemberGrants(member.id);
        setGrants(fresh);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al revocar");
      }
    });
  }

  function canRevokePermission(row: MemberGrantRow): boolean {
    if (row.grant_level === 3) return false;
    const entries = delegationByPerm.get(row.perm_code) ?? [];
    const match = entries.find(
      (e) => e.scope_type === row.scope_type && (e.scope_id ?? null) === (row.scope_id ?? null)
    );
    if (!match) return false;
    return match.max_target_level >= row.grant_level;
  }

  function permScopeLabel(row: MemberGrantRow): string {
    if (row.scope_type === "none") return "Global";
    if (row.scope_id) return deptNameById.get(row.scope_id) ?? "Departamento";
    return "Departamento";
  }

  function roleScopeLabel(r: MemberRoleAssignment): string {
    if (r.scope_type === "none") return "Global";
    return r.scope_label ?? "Departamento";
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
        <div
          className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          onClick={() => !pending && onClose()}
        />
        <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold font-heading text-brand-navy truncate">
                {member.full_name ?? member.email}
              </h2>
              <p className="text-xs text-text-muted mt-0.5 truncate">{member.email}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5">{error}</div>
          )}

          {/* Roles */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Roles
              </h3>
              {availableRolesToGrant.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddRoleModal(true)}
                  className="text-xs font-medium text-brand-teal hover:text-brand-navy transition-colors cursor-pointer"
                >
                  + Añadir rol
                </button>
              )}
            </div>
            {loading ? (
              <p className="text-xs text-text-muted">Cargando…</p>
            ) : roleAssignments.length === 0 ? (
              <p className="text-xs text-text-muted italic">Sin roles asignados.</p>
            ) : (
              <ul className="space-y-1.5">
                {roleAssignments.map((r, idx) => {
                  const expanded = expandedRoleIdx === idx;
                  const perms = ROLE_PERMISSIONS[r.role_name] ?? [];
                  const showLevel = r.role_name === "Backoffice";
                  return (
                    <li
                      key={`${r.role_name}-${r.scope_type}-${r.scope_id ?? "none"}-${idx}`}
                      className="text-xs bg-gray-50 rounded-lg"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedRoleIdx(expanded ? null : idx)}
                        className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 cursor-pointer hover:bg-gray-100 transition-colors rounded-lg"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <svg
                            className={`w-3 h-3 text-text-muted transition-transform flex-shrink-0 ${
                              expanded ? "rotate-90" : ""
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <div className="min-w-0">
                            <div className="font-medium text-brand-navy truncate">
                              {r.role_name}
                            </div>
                            <div className="text-text-muted truncate">{roleScopeLabel(r)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {showLevel && (
                            <span
                              className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                                r.grant_level === 3
                                  ? "bg-purple-100 text-purple-700"
                                  : r.grant_level === 2
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-gray-200 text-gray-700"
                              }`}
                            >
                              N{r.grant_level}
                            </span>
                          )}
                          {canRevokeRole(r) ? (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!pending) handleRevokeRole(r);
                              }}
                              className="text-[11px] text-red-600 hover:text-red-700 font-medium cursor-pointer"
                            >
                              Quitar
                            </span>
                          ) : (
                            <span className="text-[11px] text-text-muted">—</span>
                          )}
                        </div>
                      </button>
                      {expanded && (
                        <div className="border-t border-gray-200 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1">
                            Permisos incluidos
                          </p>
                          {perms.length === 0 ? (
                            <p className="text-[11px] text-text-muted italic">
                              Sin permisos listados.
                            </p>
                          ) : (
                            <ul className="space-y-0.5">
                              {perms.map((code) => (
                                <li key={code} className="text-[11px] text-text-body">
                                  · {permLabel(code)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Permisos */}
          <section className="space-y-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Permisos
              </h3>
              {hasAnyPermToGrant && (
                <button
                  type="button"
                  onClick={() => setShowAddPermModal(true)}
                  className="text-xs font-medium text-brand-teal hover:text-brand-navy transition-colors cursor-pointer"
                >
                  + Añadir permiso
                </button>
              )}
            </div>
            {loading ? (
              <p className="text-xs text-text-muted">Cargando…</p>
            ) : grants.length === 0 ? (
              <p className="text-xs text-text-muted italic">Sin permisos directos.</p>
            ) : (
              <ul className="space-y-1.5">
                {grants.map((g) => {
                  const meta = getGrantablePermission(g.perm_code);
                  return (
                    <li
                      key={`${g.perm_code}-${g.scope_type}-${g.scope_id ?? ""}`}
                      className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-brand-navy truncate">
                          {meta?.label ?? g.perm_code}
                        </div>
                        <div className="text-text-muted truncate">{permScopeLabel(g)}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                            g.grant_level === 3
                              ? "bg-purple-100 text-purple-700"
                              : g.grant_level === 2
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          N{g.grant_level}
                        </span>
                        {canRevokePermission(g) ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleRevokePermission(g)}
                            className="text-[11px] text-red-600 hover:text-red-700 font-medium disabled:opacity-50 cursor-pointer"
                          >
                            Quitar
                          </button>
                        ) : (
                          <span
                            className="text-[11px] text-text-muted"
                            title={
                              g.grant_level === 3
                                ? "N3 solo se modifica por SQL"
                                : "No tienes nivel suficiente para revocar"
                            }
                          >
                            —
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {showAddPermModal && (
        <AddPermissionModal
          targetProfileId={member.id}
          delegations={delegations}
          existingGrants={grants}
          roleAssignments={roleAssignments}
          departments={departments}
          onClose={() => setShowAddPermModal(false)}
          onSaved={async () => {
            setShowAddPermModal(false);
            await reloadAll();
            onMutated?.();
          }}
        />
      )}

      {showAddRoleModal && (
        <AddRoleModal
          targetProfileId={member.id}
          availableRoles={availableRolesToGrant}
          onClose={() => setShowAddRoleModal(false)}
          onSaved={async () => {
            setShowAddRoleModal(false);
            await reloadAll();
            onMutated?.();
          }}
        />
      )}
    </>
  );
}
