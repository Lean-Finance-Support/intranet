"use client";

import { useEffect, useMemo, useState } from "react";
import type { BlockTemplate, DepartmentMember } from "@/lib/types/documentation";

interface Props {
  companyId: string;
  assignable: {
    blocks: BlockTemplate[];
    membersByDept: Record<string, DepartmentMember[]>;
  };
  onClose: () => void;
  onSubmit: (input: {
    companyId: string;
    blockId: string;
    apartados: { apartadoId: string; supervisorIds: string[] }[];
  }) => Promise<void>;
}

export default function AddBlockModal({ companyId, assignable, onClose, onSubmit }: Props) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    assignable.blocks[0]?.id ?? null
  );
  // apartadoId -> supervisor profile ids
  const [supervisorsByApartado, setSupervisorsByApartado] = useState<Record<string, string[]>>({});
  // Apartados excluidos del bloque actual (por defecto todos van incluidos).
  const [excludedApartadoIds, setExcludedApartadoIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const block = assignable.blocks.find((b) => b.id === selectedBlockId) ?? null;

  const candidatesByApartado = useMemo(() => {
    const map: Record<string, DepartmentMember[]> = {};
    if (!block) return map;
    for (const a of block.apartados) {
      const list: DepartmentMember[] = [];
      if (a.is_global) {
        for (const arr of Object.values(assignable.membersByDept)) list.push(...arr);
      } else {
        for (const d of a.department_ids) list.push(...(assignable.membersByDept[d] ?? []));
      }
      map[a.id] = Array.from(new Map(list.map((m) => [m.id, m])).values());
    }
    return map;
  }, [block, assignable.membersByDept]);

  function addSupervisor(apartadoId: string, profileId: string) {
    if (!profileId) return;
    setSupervisorsByApartado((prev) => {
      const list = prev[apartadoId] ?? [];
      if (list.includes(profileId)) return prev;
      return { ...prev, [apartadoId]: [...list, profileId] };
    });
  }
  function removeSupervisor(apartadoId: string, profileId: string) {
    setSupervisorsByApartado((prev) => ({
      ...prev,
      [apartadoId]: (prev[apartadoId] ?? []).filter((id) => id !== profileId),
    }));
  }
  function toggleApartado(apartadoId: string) {
    setExcludedApartadoIds((prev) => {
      const next = new Set(prev);
      if (next.has(apartadoId)) next.delete(apartadoId);
      else next.add(apartadoId);
      return next;
    });
  }

  const includedApartados = (block?.apartados ?? []).filter((a) => !excludedApartadoIds.has(a.id));

  async function handleSubmit() {
    if (!block) return;
    if (includedApartados.length === 0) {
      setError("Selecciona al menos un apartado.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        companyId,
        blockId: block.id,
        apartados: includedApartados.map((a) => ({
          apartadoId: a.id,
          supervisorIds: supervisorsByApartado[a.id] ?? [],
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al añadir bloque");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 pointer-events-none">
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] bg-white rounded-2xl shadow-2xl ring-1 ring-black/8 flex flex-col pointer-events-auto overflow-hidden animate-fade-in">

        {/* Header */}
        <div className="bg-brand-navy px-5 py-3 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Añadir bloque al cliente</h2>
            <p className="text-[11px] text-white/60 mt-0.5">
              Selecciona un bloque y asigna supervisores.
            </p>
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
          {assignable.blocks.length === 0 ? (
            <p className="text-sm text-text-muted italic">
              No hay bloques disponibles para asignar (o ya los tiene todos).
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Bloque <span className="text-red-400">*</span>
                </label>
                <select
                  value={selectedBlockId ?? ""}
                  onChange={(e) => {
                    setSelectedBlockId(e.target.value || null);
                    setSupervisorsByApartado({});
                    setExcludedApartadoIds(new Set());
                  }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal focus:bg-white transition-colors"
                >
                  {assignable.blocks.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {block?.description && (
                  <p className="text-[11px] text-text-muted mt-1">{block.description}</p>
                )}
              </div>

              {block && block.apartados.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Apartados — {includedApartados.length} de {block.apartados.length} seleccionado
                    {block.apartados.length !== 1 ? "s" : ""}
                  </p>
                  {block.apartados.map((a) => (
                    <ApartadoSupervisorRow
                      key={a.id}
                      apartado={a}
                      included={!excludedApartadoIds.has(a.id)}
                      onToggle={() => toggleApartado(a.id)}
                      candidates={candidatesByApartado[a.id] ?? []}
                      selectedIds={supervisorsByApartado[a.id] ?? []}
                      onAdd={(id) => addSupervisor(a.id, id)}
                      onRemove={(id) => removeSupervisor(a.id, id)}
                    />
                  ))}
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
            disabled={submitting || !block || includedApartados.length === 0}
            className="text-sm bg-brand-teal text-white px-4 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 transition-colors cursor-pointer font-medium"
          >
            {submitting ? "Añadiendo..." : "Añadir bloque"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApartadoSupervisorRow({
  apartado,
  included,
  onToggle,
  candidates,
  selectedIds,
  onAdd,
  onRemove,
}: {
  apartado: { id: string; name: string; description: string | null };
  included: boolean;
  onToggle: () => void;
  candidates: DepartmentMember[];
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const remaining = candidates.filter((m) => !selectedIds.includes(m.id));
  const candidateMap = new Map(candidates.map((m) => [m.id, m]));

  const grouped = useMemo(() => {
    const groups = new Map<string, { name: string; members: DepartmentMember[] }>();
    for (const m of remaining) {
      if (!groups.has(m.department_id)) {
        groups.set(m.department_id, { name: m.department_name, members: [] });
      }
      groups.get(m.department_id)!.members.push(m);
    }
    return Array.from(groups.entries())
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [remaining]);

  const hasMultipleDepts = grouped.length > 1;

  return (
    <div
      className={`rounded-lg px-3 py-2 space-y-1.5 transition-colors ${
        included ? "bg-gray-50" : "bg-gray-50/40"
      }`}
    >
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={included}
          onChange={onToggle}
          className="w-3.5 h-3.5 rounded border-gray-300 text-brand-teal focus:ring-brand-teal/30 cursor-pointer"
        />
        <span
          className={`text-xs font-medium ${
            included ? "text-text-body" : "text-text-muted line-through"
          }`}
        >
          {apartado.name}
        </span>
      </label>

      {included && (
        <div className="space-y-1.5 pl-[1.375rem]">
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedIds.map((id) => {
                const m = candidateMap.get(id);
                if (!m) return null;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full pl-2 pr-0.5 py-0.5"
                  >
                    <span className="text-text-body">{m.full_name ?? m.email}</span>
                    <button
                      onClick={() => onRemove(id)}
                      className="w-3.5 h-3.5 rounded-full text-text-muted hover:text-red-500 hover:bg-red-50 cursor-pointer flex items-center justify-center transition-colors"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {remaining.length > 0 ? (
            <select
              value=""
              onChange={(e) => onAdd(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
            >
              <option value="">+ Añadir supervisor</option>
              {hasMultipleDepts
                ? grouped.map((g) => (
                    <optgroup key={g.id} label={g.name}>
                      {g.members.map((m) => (
                        <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
                      ))}
                    </optgroup>
                  ))
                : remaining.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
                  ))}
            </select>
          ) : (
            selectedIds.length === 0 && (
              <p className="text-[11px] text-text-muted italic">Sin candidatos.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
