"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ApartadoTemplate,
  BlockTemplate,
  DepartmentMember,
} from "@/lib/types/documentation";

// Default de opcionalidad heredado del catálogo (replicado en otros sitios).
function isOptionalByDefault(a: ApartadoTemplate): boolean {
  if (a.is_global) return a.is_optional_global ?? false;
  const links = a.departments ?? [];
  if (links.length === 0) return false;
  return links.every((d) => d.is_optional);
}

interface Props {
  companyId: string;
  clientBlockId: string;
  blockId: string;
  assignable: {
    blocks: BlockTemplate[];
    membersByDept: Record<string, DepartmentMember[]>;
  };
  excludeApartadoIds?: string[];
  onClose: () => void;
  onSubmit: (input: {
    companyId: string;
    clientBlockId: string;
    apartadoId: string;
    supervisorIds: string[];
    isOptional?: boolean;
  }) => Promise<void>;
}

export default function AddApartadoModal({
  companyId,
  clientBlockId,
  blockId,
  assignable,
  excludeApartadoIds = [],
  onClose,
  onSubmit,
}: Props) {
  const block = assignable.blocks.find((b) => b.id === blockId) ?? null;
  const availableApartados =
    block?.apartados.filter((a) => !excludeApartadoIds.includes(a.id)) ?? [];

  const [apartadoId, setApartadoId] = useState<string>(availableApartados[0]?.id ?? "");
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);
  const [isOptional, setIsOptional] = useState(() => {
    const a = availableApartados[0];
    return a ? isOptionalByDefault(a) : false;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allCandidates = useMemo<DepartmentMember[]>(() => {
    if (!block) return [];
    const a = block.apartados.find((x) => x.id === apartadoId);
    if (!a) return [];
    const list: DepartmentMember[] = [];
    if (a.is_global) {
      for (const arr of Object.values(assignable.membersByDept)) list.push(...arr);
    } else {
      for (const d of a.department_ids) list.push(...(assignable.membersByDept[d] ?? []));
    }
    return Array.from(new Map(list.map((m) => [m.id, m])).values());
  }, [block, apartadoId, assignable.membersByDept]);

  const remainingCandidates = allCandidates.filter((m) => !supervisorIds.includes(m.id));

  // Agrupar por dept para optgroup
  const groupedCandidates = useMemo(() => {
    const groups = new Map<string, { name: string; members: DepartmentMember[] }>();
    for (const m of remainingCandidates) {
      if (!groups.has(m.department_id)) {
        groups.set(m.department_id, { name: m.department_name, members: [] });
      }
      groups.get(m.department_id)!.members.push(m);
    }
    return Array.from(groups.entries())
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [remainingCandidates]);

  const hasMultipleDepts = groupedCandidates.length > 1;

  function handleApartadoChange(id: string) {
    setApartadoId(id);
    setSupervisorIds([]);
    const a = block?.apartados.find((x) => x.id === id);
    setIsOptional(a ? isOptionalByDefault(a) : false);
  }

  function handleAddSupervisor(id: string) {
    if (!id) return;
    setSupervisorIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function handleRemoveSupervisor(id: string) {
    setSupervisorIds((prev) => prev.filter((p) => p !== id));
  }

  async function handleSubmit() {
    if (!apartadoId) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ companyId, clientBlockId, apartadoId, supervisorIds, isOptional });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al añadir apartado");
      setSubmitting(false);
    }
  }

  const supervisorMap = new Map(allCandidates.map((m) => [m.id, m]));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 pointer-events-none">
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[85vh] bg-white rounded-2xl shadow-2xl ring-1 ring-black/8 flex flex-col pointer-events-auto overflow-hidden animate-fade-in">

        {/* Header */}
        <div className="bg-brand-navy px-5 py-3 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Añadir apartado</h2>
            {block && <p className="text-[11px] text-white/60 mt-0.5">Bloque: {block.name}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 mt-0.5 p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!block ? (
            <p className="text-sm text-red-500">Bloque del catálogo no disponible.</p>
          ) : availableApartados.length === 0 ? (
            <p className="text-sm text-text-muted italic">
              Todos los apartados de este bloque ya están añadidos.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Apartado <span className="text-red-400">*</span>
                </label>
                <select
                  value={apartadoId}
                  onChange={(e) => handleApartadoChange(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal focus:bg-white transition-colors"
                >
                  <option value="">— Selecciona —</option>
                  {availableApartados.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {apartadoId && (
                <label
                  className="flex items-center gap-2 cursor-pointer select-none"
                  title="Si es opcional, no cuenta en el progreso del cliente"
                >
                  <input
                    type="checkbox"
                    checked={isOptional}
                    onChange={(e) => setIsOptional(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-brand-navy focus:ring-brand-navy/30 cursor-pointer"
                  />
                  <span className={`text-xs font-medium ${isOptional ? "text-brand-navy" : "text-text-body"}`}>
                    Apartado opcional
                  </span>
                  <span className="text-[11px] text-text-muted">
                    — no cuenta en el progreso global
                  </span>
                </label>
              )}

              {apartadoId && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Supervisores {supervisorIds.length > 0 && `(${supervisorIds.length})`}
                  </p>

                  {supervisorIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {supervisorIds.map((id) => {
                        const m = supervisorMap.get(id);
                        if (!m) return null;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-full pl-2.5 pr-1 py-0.5"
                          >
                            <span className="text-text-body font-medium">{m.full_name ?? m.email}</span>
                            <button
                              onClick={() => handleRemoveSupervisor(id)}
                              className="ml-0.5 w-4 h-4 rounded-full text-text-muted hover:text-red-500 hover:bg-red-50 cursor-pointer flex items-center justify-center transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {remainingCandidates.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => handleAddSupervisor(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
                    >
                      <option value="">+ Añadir supervisor</option>
                      {hasMultipleDepts
                        ? groupedCandidates.map((g) => (
                            <optgroup key={g.id} label={g.name}>
                              {g.members.map((m) => (
                                <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
                              ))}
                            </optgroup>
                          ))
                        : remainingCandidates.map((m) => (
                            <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
                          ))}
                    </select>
                  )}
                </div>
              )}
            </>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm text-text-muted hover:text-text-body px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !apartadoId}
            className="text-sm bg-brand-teal text-white px-4 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 transition-colors cursor-pointer font-medium"
          >
            {submitting ? "Añadiendo..." : "Añadir apartado"}
          </button>
        </div>
      </div>
    </div>
  );
}
