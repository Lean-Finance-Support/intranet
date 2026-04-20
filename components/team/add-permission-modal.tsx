"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  CurrentUserDelegation,
  MemberGrantRow,
  MemberRoleAssignment,
} from "@/app/admin/departamento/permissions-actions";
import { grantPermission } from "@/app/admin/departamento/permissions-actions";
import { GRANTABLE_PERMISSIONS, getGrantablePermission } from "@/lib/permission-catalog";
import { ROLE_PERMISSIONS } from "@/lib/role-catalog";

type GrantScope = { type: "none" } | { type: "department"; id: string };

function scopeKey(scopeType: string, scopeId: string | null) {
  return `${scopeType}:${scopeId ?? ""}`;
}

function heldKey(perm: string, scopeType: string, scopeId: string | null) {
  return `${perm}::${scopeType}::${scopeId ?? ""}`;
}

interface Props {
  targetProfileId: string;
  delegations: CurrentUserDelegation[];
  existingGrants: MemberGrantRow[];
  roleAssignments: MemberRoleAssignment[];
  departments: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AddPermissionModal({
  targetProfileId,
  delegations,
  existingGrants,
  roleAssignments,
  departments,
  onClose,
  onSaved,
}: Props) {
  const [selectedPerm, setSelectedPerm] = useState<string>("");
  const [selectedScopeKey, setSelectedScopeKey] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<1 | 2>(1);
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const deptNameById = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments]
  );

  const heldSet = useMemo(() => {
    const s = new Set<string>();
    // 1. Perms directos
    for (const g of existingGrants) s.add(heldKey(g.perm_code, g.scope_type, g.scope_id));
    // 2. Perms cubiertos por cualquier rol que el target tenga
    for (const r of roleAssignments) {
      const perms = ROLE_PERMISSIONS[r.role_name] ?? [];
      for (const code of perms) s.add(heldKey(code, r.scope_type, r.scope_id));
    }
    return s;
  }, [existingGrants, roleAssignments]);

  const delegationByPerm = useMemo(() => {
    const map = new Map<string, CurrentUserDelegation[]>();
    for (const d of delegations) {
      // Filtra scopes que el target ya tiene para ese permiso
      if (heldSet.has(heldKey(d.perm_code, d.scope_type, d.scope_id))) continue;
      const list = map.get(d.perm_code) ?? [];
      list.push(d);
      map.set(d.perm_code, list);
    }
    return map;
  }, [delegations, heldSet]);

  const availablePerms = useMemo(
    () => GRANTABLE_PERMISSIONS.filter((p) => delegationByPerm.has(p.code)),
    [delegationByPerm]
  );

  const selectedPermMeta = useMemo(
    () => (selectedPerm ? getGrantablePermission(selectedPerm) : undefined),
    [selectedPerm]
  );

  const availableScopes = useMemo(() => {
    if (!selectedPerm) return [] as { key: string; label: string; maxLevel: 1 | 2 }[];
    const entries = delegationByPerm.get(selectedPerm) ?? [];
    return entries.map((e) => {
      const key = scopeKey(e.scope_type, e.scope_id);
      const label =
        e.scope_type === "none"
          ? "Global"
          : e.scope_id
          ? deptNameById.get(e.scope_id) ?? "Departamento"
          : "Departamento";
      return { key, label, maxLevel: e.max_target_level };
    });
  }, [selectedPerm, delegationByPerm, deptNameById]);

  const selectedScopeEntry = availableScopes.find((s) => s.key === selectedScopeKey);
  const maxLevel = selectedScopeEntry?.maxLevel ?? 1;
  const effectiveLevel = (Math.min(selectedLevel, maxLevel) || 1) as 1 | 2;

  function parseScope(key: string): GrantScope | null {
    const [type, id] = key.split(":");
    if (type === "none") return { type: "none" };
    if (type === "department" && id) return { type: "department", id };
    return null;
  }

  function handleSave() {
    if (!selectedPerm || !selectedScopeKey) return;
    const scope = parseScope(selectedScopeKey);
    if (!scope) return;
    setError("");
    startTransition(async () => {
      try {
        await grantPermission(targetProfileId, selectedPerm, scope, effectiveLevel);
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al otorgar");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={() => !pending && onClose()}
      />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold font-heading text-brand-navy">Añadir permiso</h2>
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

        {availablePerms.length === 0 ? (
          <p className="text-xs text-text-muted italic">
            {delegations.length === 0
              ? "No tienes nivel suficiente para delegar ningún permiso."
              : "Este empleado ya tiene todos los permisos que puedes otorgar."}
          </p>
        ) : (
          <>
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1">Permiso</label>
              <select
                value={selectedPerm}
                onChange={(e) => {
                  setSelectedPerm(e.target.value);
                  setSelectedScopeKey("");
                  setSelectedLevel(1);
                }}
                disabled={pending}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-teal"
              >
                <option value="">— Selecciona un permiso —</option>
                {availablePerms.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
              {selectedPermMeta && (
                <p className="text-[11px] text-text-muted mt-1">{selectedPermMeta.description}</p>
              )}
            </div>

            {selectedPerm && (
              <div>
                <label className="block text-[11px] font-medium text-text-muted mb-1">Ámbito</label>
                <select
                  value={selectedScopeKey}
                  onChange={(e) => setSelectedScopeKey(e.target.value)}
                  disabled={pending}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-teal"
                >
                  <option value="">— Selecciona un ámbito —</option>
                  {availableScopes.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedPerm && selectedScopeKey && (
              <div>
                <label className="block text-[11px] font-medium text-text-muted mb-1">Nivel</label>
                <div className="flex gap-2">
                  {[1, 2].map((lvl) => {
                    const disabled = lvl > maxLevel;
                    const active = effectiveLevel === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        disabled={disabled || pending}
                        onClick={() => setSelectedLevel(lvl as 1 | 2)}
                        className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          active
                            ? "bg-brand-navy text-white border-brand-navy"
                            : "bg-white text-brand-navy border-gray-200 hover:border-brand-navy/40"
                        }`}
                      >
                        <div className="font-semibold">N{lvl}</div>
                        <div className="text-[10px] opacity-80">
                          {lvl === 1 ? "Solo usar" : "Usar + otorgar"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={!selectedPerm || !selectedScopeKey || pending}
              className="w-full text-sm font-medium bg-brand-teal text-white rounded-lg px-4 py-2.5 hover:bg-brand-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {pending ? "Guardando…" : "Otorgar permiso"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
