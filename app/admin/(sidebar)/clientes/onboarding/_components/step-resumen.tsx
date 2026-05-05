"use client";

import { useMemo, useState } from "react";
import type {
  OnboardingState,
  ApartadoOverride,
  ApartadoComputed,
} from "./onboarding-state";
import { computeApartados } from "./onboarding-state";
import type { OnboardingDepartment } from "../actions";
import type {
  BlockTemplate,
  ApartadoTemplate,
  DocumentationTag,
} from "@/lib/types/documentation";

interface Props {
  state: OnboardingState;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  departments: OnboardingDepartment[];
  blocks: BlockTemplate[];
  tags: DocumentationTag[];
}

export default function StepResumen({
  state,
  setState,
  departments,
  blocks,
  tags,
}: Props) {
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [supervisorEditingFor, setSupervisorEditingFor] = useState<string | null>(null);

  const computed = useMemo(
    () => computeApartados(state, blocks, tags),
    [state, blocks, tags]
  );

  function setOverride(apartadoId: string, patch: Partial<ApartadoOverride>) {
    setState((prev) => {
      const current: ApartadoOverride = prev.apartado_overrides[apartadoId] ?? {
        apartado_id: apartadoId,
        is_optional: false,
        supervisor_ids: null,
        removed: false,
        added: false,
      };
      const next: ApartadoOverride = { ...current, ...patch };
      return {
        ...prev,
        apartado_overrides: { ...prev.apartado_overrides, [apartadoId]: next },
      };
    });
  }

  function setOverridesBatch(patches: { id: string; patch: Partial<ApartadoOverride> }[]) {
    setState((prev) => {
      const next = { ...prev.apartado_overrides };
      for (const { id, patch } of patches) {
        const current: ApartadoOverride = next[id] ?? {
          apartado_id: id,
          is_optional: false,
          supervisor_ids: null,
          removed: false,
          added: false,
        };
        next[id] = { ...current, ...patch };
      }
      return { ...prev, apartado_overrides: next };
    });
  }

  function toggleOptional(c: ApartadoComputed) {
    setOverride(c.apartado.id, { is_optional: !c.is_optional });
  }
  function removeApartado(apartadoId: string) {
    setOverride(apartadoId, { removed: true });
  }
  function restoreApartado(apartadoId: string) {
    setOverride(apartadoId, { removed: false });
  }
  function addApartadoFromCatalog(a: ApartadoTemplate) {
    setOverride(a.id, { added: true, removed: false });
  }
  function addBlockFromCatalog(b: BlockTemplate) {
    // Añadir todos los apartados del bloque que no estén ya en computed
    const usedIds = new Set(computed.map((c) => c.apartado.id));
    const patches = b.apartados
      .filter((a) => !usedIds.has(a.id))
      .map((a) => ({ id: a.id, patch: { added: true, removed: false } }));
    setOverridesBatch(patches);
  }
  function setSupervisors(apartadoId: string, ids: string[]) {
    setOverride(apartadoId, { supervisor_ids: ids });
  }

  // Agrupar por bloque para presentación
  const blockGroups = useMemo(() => {
    const grouped = new Map<string, ApartadoComputed[]>();
    for (const c of computed) {
      const list = grouped.get(c.block.id) ?? [];
      list.push(c);
      grouped.set(c.block.id, list);
    }
    return [...grouped.entries()]
      .map(([blockId, items]) => ({
        block: blocks.find((b) => b.id === blockId)!,
        items: items.sort(
          (a, b) => a.apartado.display_order - b.apartado.display_order
        ),
      }))
      .filter((g) => g.block)
      .sort((a, b) => a.block.display_order - b.block.display_order);
  }, [computed, blocks]);

  // Validación: cualquier apartado sin supervisor bloquea el siguiente paso.
  const unsupervised = computed.filter((c) => c.supervisor_ids.length === 0);

  // Stats
  const total = computed.length;
  const optionalCount = computed.filter((c) => c.is_optional).length;
  const mandatoryCount = total - optionalCount;

  // Mapa de profile_id → display name
  const profileNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departments) {
      for (const m of d.members) {
        map.set(m.id, m.full_name?.trim() || m.email);
      }
    }
    return map;
  }, [departments]);

  const removedOverrides = Object.values(state.apartado_overrides).filter(
    (o) => o.removed
  );

  return (
    <div className="space-y-6">
      {/* Header con stats y picker */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-brand-navy">
            Documentación inicial sugerida
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            Revisa la lista y ajústala antes de notificar al cliente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Stat label="Apartados" value={total} />
          {mandatoryCount > 0 && (
            <Stat label="Obligatorios" value={mandatoryCount} tone="navy" />
          )}
          {optionalCount > 0 && (
            <Stat label="Opcionales" value={optionalCount} tone="amber" />
          )}
          <button
            type="button"
            onClick={() => setShowAddPicker(true)}
            className="text-xs text-brand-teal hover:text-white hover:bg-brand-teal px-3 py-1.5 rounded-lg border border-brand-teal/40 hover:border-brand-teal cursor-pointer transition-colors"
          >
            + Añadir del catálogo
          </button>
        </div>
      </div>

      {showAddPicker && (
        <AddCatalogPicker
          blocks={blocks}
          computed={computed}
          onAddBlock={(b) => {
            addBlockFromCatalog(b);
            setShowAddPicker(false);
          }}
          onAddApartado={(a) => {
            addApartadoFromCatalog(a);
            setShowAddPicker(false);
          }}
          onClose={() => setShowAddPicker(false)}
        />
      )}

      {/* Aviso de apartados sin supervisor */}
      {unsupervised.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-xs text-amber-900 font-medium">
              {unsupervised.length}{" "}
              {unsupervised.length === 1
                ? "apartado sin supervisor"
                : "apartados sin supervisor"}
            </p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Asígnale al menos uno o quítalo del listado para poder finalizar.
            </p>
          </div>
        </div>
      )}

      {/* Listado vacío */}
      {blockGroups.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <p className="text-sm text-text-muted">
            No hay apartados que pedir con la configuración actual.
          </p>
          <p className="text-xs text-text-muted/80 mt-1">
            Añade apartados manualmente o vuelve al paso anterior y revisa departamentos / tags.
          </p>
        </div>
      )}

      {/* Listado de bloques */}
      <div className="space-y-4">
        {blockGroups.map((g) => (
          <div
            key={g.block.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
          >
            <div className="px-5 py-3 bg-gradient-to-r from-brand-navy/5 to-transparent border-b border-gray-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-brand-teal rounded-full" />
                  <p className="text-sm font-semibold text-brand-navy">
                    {g.block.name}
                  </p>
                  <span className="text-[11px] text-text-muted">
                    · {g.items.length}{" "}
                    {g.items.length === 1 ? "apartado" : "apartados"}
                  </span>
                </div>
              </div>
              {g.block.description && (
                <p className="text-[11px] text-text-muted mt-0.5 ml-3">
                  {g.block.description}
                </p>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {g.items.map((c) => {
                const isEditingSupervisors = supervisorEditingFor === c.apartado.id;
                return (
                  <ApartadoRow
                    key={c.apartado.id}
                    item={c}
                    state={state}
                    departments={departments}
                    tags={tags}
                    profileNameMap={profileNameMap}
                    isEditing={isEditingSupervisors}
                    onToggleOptional={() => toggleOptional(c)}
                    onRemove={() => removeApartado(c.apartado.id)}
                    onToggleEdit={() =>
                      setSupervisorEditingFor(
                        isEditingSupervisors ? null : c.apartado.id
                      )
                    }
                    onSetSupervisors={(ids) => setSupervisors(c.apartado.id, ids)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sección colapsable de quitados */}
      {removedOverrides.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-text-muted mb-2">
            Apartados quitados ({removedOverrides.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {removedOverrides.map((o) => {
              const ap = blocks
                .flatMap((b) => b.apartados)
                .find((a) => a.id === o.apartado_id);
              if (!ap) return null;
              return (
                <button
                  key={o.apartado_id}
                  type="button"
                  onClick={() => restoreApartado(o.apartado_id)}
                  className="text-[11px] bg-white text-text-muted border border-gray-200 hover:border-brand-teal hover:text-brand-teal px-2.5 py-1 rounded-full cursor-pointer transition-colors"
                  title="Restaurar"
                >
                  + {ap.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "navy" | "amber";
}) {
  const styles =
    tone === "navy"
      ? "bg-brand-navy/10 text-brand-navy"
      : tone === "amber"
        ? "bg-amber-100 text-amber-800"
        : "bg-gray-100 text-text-muted";
  return (
    <span
      className={`text-[11px] px-2 py-1 rounded-full font-medium ${styles}`}
      title={label}
    >
      {label}: <strong className="font-semibold">{value}</strong>
    </span>
  );
}

function ApartadoRow({
  item: c,
  state,
  departments,
  tags,
  profileNameMap,
  isEditing,
  onToggleOptional,
  onRemove,
  onToggleEdit,
  onSetSupervisors,
}: {
  item: ApartadoComputed;
  state: OnboardingState;
  departments: OnboardingDepartment[];
  tags: DocumentationTag[];
  profileNameMap: Map<string, string>;
  isEditing: boolean;
  onToggleOptional: () => void;
  onRemove: () => void;
  onToggleEdit: () => void;
  onSetSupervisors: (ids: string[]) => void;
}) {
  // Departamentos efectivos del apartado (los que tocan tras filtros).
  const apartadoDeptIds = c.apartado.is_global
    ? state.selected_dept_ids
    : c.matched_dept_ids;
  const apartadoDepts = departments.filter((d) => apartadoDeptIds.includes(d.id));

  return (
    <div className="px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-text-body font-medium">
              {c.apartado.name}
            </p>
            {c.is_optional && (
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">
                Opcional
              </span>
            )}
            {c.added && (
              <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 rounded-full font-medium">
                Añadido manualmente
              </span>
            )}
            {c.matched_tag_ids.map((tid) => {
              const t = tags.find((tt) => tt.id === tid);
              if (!t) return null;
              return (
                <span
                  key={tid}
                  className="text-[10px] bg-brand-navy/10 text-brand-navy px-1.5 py-0.5 rounded-full"
                >
                  {t.name}
                </span>
              );
            })}
          </div>
          {c.apartado.description && (
            <p className="text-[11px] text-text-muted mt-0.5">
              {c.apartado.description}
            </p>
          )}
          {/* Resumen de supervisores actuales */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <svg className="w-3 h-3 text-text-muted/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            {c.supervisor_ids.length === 0 ? (
              <span className="text-[11px] text-amber-700 font-medium">
                Sin supervisor asignado
              </span>
            ) : (
              c.supervisor_ids.map((sid) => (
                <span
                  key={sid}
                  className="text-[11px] bg-brand-navy/8 text-brand-navy px-1.5 py-0.5 rounded-full border border-brand-navy/10"
                >
                  {profileNameMap.get(sid) ?? sid}
                </span>
              ))
            )}
            <button
              type="button"
              onClick={onToggleEdit}
              className="text-[11px] text-brand-teal hover:underline cursor-pointer ml-1"
            >
              {isEditing ? "Cerrar" : c.supervisor_ids.length === 0 ? "Asignar" : "Editar"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onToggleOptional}
            title={
              c.is_optional ? "Marcar como obligatorio" : "Marcar como opcional"
            }
            className={`text-[11px] px-2 py-1 rounded-md cursor-pointer transition-colors ${
              c.is_optional
                ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                : "bg-gray-100 text-text-muted hover:bg-gray-200"
            }`}
          >
            {c.is_optional ? "Opcional" : "Obligatorio"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Quitar de la documentación inicial"
            className="text-text-muted hover:text-red-500 hover:bg-red-50 cursor-pointer w-7 h-7 inline-flex items-center justify-center rounded-md"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor expandido de supervisores: agrupado por departamento */}
      {isEditing && (
        <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-200/60">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <p className="text-[11px] font-semibold text-brand-navy">
              Supervisores por departamento
            </p>
            <p className="text-[10px] text-text-muted">
              {c.supervisor_ids.length} seleccionados
            </p>
          </div>
          {apartadoDepts.length === 0 ? (
            <p className="text-[11px] text-text-muted italic">
              No hay departamentos relevantes para este apartado.
            </p>
          ) : (
            <div className="space-y-2.5">
              {apartadoDepts.map((d) => {
                const seenIds = new Set<string>();
                const members = d.members.filter((m) => {
                  if (seenIds.has(m.id)) return false;
                  seenIds.add(m.id);
                  return true;
                });
                const selectedInDept = members
                  .map((m) => m.id)
                  .filter((id) => c.supervisor_ids.includes(id));
                return (
                  <div key={d.id} className="bg-white rounded-md p-2.5 border border-gray-100">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1 h-3.5 bg-brand-teal/70 rounded-full" />
                        <p className="text-[11px] font-semibold text-brand-navy">
                          {d.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted">
                          {selectedInDept.length} / {members.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const allIds = members.map((m) => m.id);
                            const allSelected = allIds.every((id) =>
                              c.supervisor_ids.includes(id)
                            );
                            const others = c.supervisor_ids.filter(
                              (id) => !allIds.includes(id)
                            );
                            onSetSupervisors(
                              allSelected ? others : [...others, ...allIds]
                            );
                          }}
                          className="text-[10px] text-brand-teal hover:underline cursor-pointer"
                        >
                          {selectedInDept.length === members.length && members.length > 0
                            ? "Quitar todos"
                            : "Todos"}
                        </button>
                      </div>
                    </div>
                    {members.length === 0 ? (
                      <p className="text-[11px] text-text-muted italic">
                        Sin miembros en este departamento.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {members.map((m) => {
                          const active = c.supervisor_ids.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                const next = active
                                  ? c.supervisor_ids.filter((s) => s !== m.id)
                                  : [...c.supervisor_ids, m.id];
                                onSetSupervisors(next);
                              }}
                              className={`text-[11px] px-2 py-1 rounded-full border cursor-pointer transition-colors ${
                                active
                                  ? "bg-brand-navy text-white border-brand-navy"
                                  : "bg-white text-text-muted border-gray-200 hover:border-brand-navy/30"
                              }`}
                              title={m.email}
                            >
                              {m.full_name?.trim() || m.email}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Picker para añadir bloques completos o apartados sueltos del catálogo
// ─────────────────────────────────────────────────────────────────────────

function AddCatalogPicker({
  blocks,
  computed,
  onAddBlock,
  onAddApartado,
  onClose,
}: {
  blocks: BlockTemplate[];
  computed: ApartadoComputed[];
  onAddBlock: (b: BlockTemplate) => void;
  onAddApartado: (a: ApartadoTemplate) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"bloque" | "apartado">("bloque");
  const [search, setSearch] = useState("");

  const usedApartadoIds = new Set(computed.map((c) => c.apartado.id));

  // Para "Bloque": mostramos todos los bloques con conteo de apartados que se
  // añadirían (los que aún no están en computed).
  const bloqueCandidates = blocks
    .map((b) => ({
      block: b,
      apartadosToAdd: b.apartados.filter((a) => !usedApartadoIds.has(a.id)),
    }))
    .filter((b) => {
      if (search.trim() && !b.block.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      return true;
    });

  // Para "Apartado": agrupados por bloque, solo los que aún no están en computed.
  const apartadoCandidates = blocks
    .map((b) => ({
      block: b,
      apartados: b.apartados.filter(
        (a) =>
          !usedApartadoIds.has(a.id) &&
          (!search.trim() ||
            a.name.toLowerCase().includes(search.toLowerCase()) ||
            b.name.toLowerCase().includes(search.toLowerCase()))
      ),
    }))
    .filter((b) => b.apartados.length > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-brand-navy">
            Añadir del catálogo
          </p>
          <div className="inline-flex bg-white rounded-lg border border-gray-200 p-0.5 ml-2">
            <button
              type="button"
              onClick={() => setMode("bloque")}
              className={`text-xs px-3 py-1 rounded-md cursor-pointer transition-colors ${
                mode === "bloque"
                  ? "bg-brand-navy text-white"
                  : "text-text-muted hover:text-text-body"
              }`}
            >
              Bloque
            </button>
            <button
              type="button"
              onClick={() => setMode("apartado")}
              className={`text-xs px-3 py-1 rounded-md cursor-pointer transition-colors ${
                mode === "apartado"
                  ? "bg-brand-navy text-white"
                  : "text-text-muted hover:text-text-body"
              }`}
            >
              Apartado
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted hover:text-text-body cursor-pointer w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-gray-100"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="px-4 pt-3">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={mode === "bloque" ? "Buscar bloque..." : "Buscar apartado..."}
            className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal bg-white"
          />
        </div>
      </div>
      <div className="px-4 py-3 max-h-80 overflow-y-auto">
        {mode === "bloque" && (
          <div className="space-y-1.5">
            {bloqueCandidates.length === 0 && (
              <p className="text-xs text-text-muted/80 italic">
                No hay bloques que coincidan.
              </p>
            )}
            {bloqueCandidates.map(({ block, apartadosToAdd }) => {
              const allAlreadyAdded = apartadosToAdd.length === 0;
              return (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => !allAlreadyAdded && onAddBlock(block)}
                  disabled={allAlreadyAdded}
                  className={`w-full text-left rounded-lg px-3 py-2.5 border transition-colors ${
                    allAlreadyAdded
                      ? "bg-gray-50 border-gray-100 cursor-not-allowed opacity-60"
                      : "bg-white border-gray-200 hover:border-brand-teal hover:bg-brand-teal/5 cursor-pointer"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-navy truncate">
                        {block.name}
                      </p>
                      {block.description && (
                        <p className="text-[11px] text-text-muted truncate">
                          {block.description}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-text-muted whitespace-nowrap">
                      {allAlreadyAdded
                        ? "Ya añadido"
                        : `+ ${apartadosToAdd.length} ${apartadosToAdd.length === 1 ? "apartado" : "apartados"}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {mode === "apartado" && (
          <div className="space-y-3">
            {apartadoCandidates.length === 0 && (
              <p className="text-xs text-text-muted/80 italic">
                No hay apartados que coincidan.
              </p>
            )}
            {apartadoCandidates.map((g) => (
              <div key={g.block.id}>
                <p className="text-[11px] font-semibold text-brand-navy uppercase tracking-wide mb-1.5">
                  {g.block.name}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {g.apartados.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onAddApartado(a)}
                      className="text-xs bg-white text-text-body border border-gray-200 hover:border-brand-teal hover:text-brand-teal hover:bg-brand-teal/5 px-2.5 py-1 rounded-full cursor-pointer transition-colors"
                    >
                      + {a.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
