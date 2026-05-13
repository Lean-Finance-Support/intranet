"use client";

import { useMemo, useState, useTransition } from "react";
import type { ServiceCatalogItem } from "@/lib/types/services";
import {
  createService,
  updateService,
  archiveService,
  unarchiveService,
} from "../actions";
import ServiceFormDialog from "./service-form-dialog";
import ConfirmDialog from "@/components/confirm-dialog";

const NO_DEPT_KEY = "__no_dept__";

interface Props {
  initial: {
    services: ServiceCatalogItem[];
    departments: { id: string; name: string }[];
    canManage: boolean;
  };
  linkPrefix: string;
}

export default function ServicesWorkspace({ initial }: Props) {
  const [services, setServices] = useState(initial.services);
  const [, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ServiceCatalogItem | null>(null);
  const [pendingArchive, setPendingArchive] = useState<ServiceCatalogItem | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const hasArchived = useMemo(
    () => services.some((s) => !s.is_active),
    [services]
  );

  const visibleServices = useMemo(
    () => services.filter((s) => (showArchived ? true : s.is_active)),
    [services, showArchived]
  );

  // Agrupar por departamento. Un servicio puede estar en N deptos — aparece en
  // cada sección. Los servicios sin dpto van a NO_DEPT_KEY.
  const groups = useMemo(() => {
    const byDept = new Map<string, ServiceCatalogItem[]>();
    for (const dept of initial.departments) byDept.set(dept.id, []);
    byDept.set(NO_DEPT_KEY, []);
    for (const s of visibleServices) {
      if (s.department_ids.length === 0) {
        byDept.get(NO_DEPT_KEY)!.push(s);
      } else {
        for (const did of s.department_ids) {
          const list = byDept.get(did);
          if (list) list.push(s);
        }
      }
    }
    return byDept;
  }, [visibleServices, initial.departments]);

  function showError(e: unknown) {
    setError(e instanceof Error ? e.message : "Error inesperado");
    setTimeout(() => setError(null), 5000);
  }

  function refreshOptimistic(updater: (prev: ServiceCatalogItem[]) => ServiceCatalogItem[]) {
    setServices((prev) => updater(prev));
  }

  async function handleCreate(input: {
    name: string;
    slug: string;
    description: string | null;
    department_ids: string[];
  }) {
    try {
      const nextDisplayOrder = computeNextDisplayOrder(services);
      const { id } = await createService({ ...input, display_order: nextDisplayOrder });
      const deptNames = initial.departments
        .filter((d) => input.department_ids.includes(d.id))
        .map((d) => d.name);
      const newItem: ServiceCatalogItem = {
        id,
        name: input.name,
        slug: input.slug,
        description: input.description,
        is_active: true,
        display_order: nextDisplayOrder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        department_ids: input.department_ids,
        department_names: deptNames,
        company_count: 0,
        is_load_bearing: false,
      };
      refreshOptimistic((prev) => [...prev, newItem].sort(sortServices));
      setCreating(false);
    } catch (e) {
      showError(e);
      throw e;
    }
  }

  async function handleUpdate(
    id: string,
    input: {
      name: string;
      slug: string;
      description: string | null;
      department_ids: string[];
    }
  ) {
    try {
      const current = services.find((s) => s.id === id);
      await updateService(id, {
        ...input,
        display_order: current?.display_order,
      });
      const deptNames = initial.departments
        .filter((d) => input.department_ids.includes(d.id))
        .map((d) => d.name);
      refreshOptimistic((prev) =>
        prev
          .map((s) =>
            s.id === id
              ? {
                  ...s,
                  name: input.name,
                  slug: input.slug,
                  description: input.description,
                  department_ids: input.department_ids,
                  department_names: deptNames,
                }
              : s
          )
          .sort(sortServices)
      );
      setEditing(null);
    } catch (e) {
      showError(e);
      throw e;
    }
  }

  async function handleArchive(s: ServiceCatalogItem) {
    try {
      await archiveService(s.id);
      refreshOptimistic((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, is_active: false } : x))
      );
    } catch (e) {
      showError(e);
      throw e;
    }
  }

  async function handleUnarchive(s: ServiceCatalogItem) {
    startTransition(async () => {
      try {
        await unarchiveService(s.id);
        refreshOptimistic((prev) =>
          prev.map((x) => (x.id === s.id ? { ...x, is_active: true } : x))
        );
      } catch (e) {
        showError(e);
      }
    });
  }

  const orderedSections: { id: string; name: string; items: ServiceCatalogItem[] }[] = [
    ...initial.departments.map((d) => ({
      id: d.id,
      name: d.name,
      items: groups.get(d.id) ?? [],
    })),
    {
      id: NO_DEPT_KEY,
      name: "Sin departamento",
      items: groups.get(NO_DEPT_KEY) ?? [],
    },
  ];

  return (
    <div className="min-h-full px-8 py-12">
      <div className="max-w-7xl">
        <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
              Servicios
            </h1>
            <p className="text-text-muted text-sm mt-2 max-w-xl">
              Servicios que Lean Finance ofrece a sus clientes. Cada servicio
              puede pertenecer a uno o varios departamentos — los técnicos del
              servicio se gestionan en la ficha de cada cliente.
            </p>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            {hasArchived && (
              <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Ver archivados
              </label>
            )}
            {initial.canManage && (
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 bg-brand-teal text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nuevo servicio
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        {!initial.canManage && (
          <p className="mt-6 text-sm text-text-muted bg-white rounded-xl px-4 py-3 border border-gray-100 flex items-start gap-2">
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0 mt-0.5"
              aria-hidden
            >
              <rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>
              Estás viendo el catálogo en modo lectura. Para editarlo necesitas
              el permiso correspondiente.
            </span>
          </p>
        )}

        <div className="mt-8 space-y-4">
          {orderedSections.map((section, sectionIdx) => {
            if (section.items.length === 0 && !showArchived && section.id !== NO_DEPT_KEY) {
              // sección de dpto vacía y no estamos viendo archivados → ocultar
              return null;
            }
            if (section.items.length === 0) return null;
            const isNoDept = section.id === NO_DEPT_KEY;
            return (
              <div
                key={section.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm"
              >
                <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className="rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        width: 28,
                        height: 28,
                        backgroundColor: "white",
                        border: isNoDept
                          ? "1.5px solid #94a3b8"
                          : "1.5px solid #00B0B7",
                        color: isNoDept ? "#94a3b8" : "#00B0B7",
                      }}
                      aria-hidden
                    >
                      <span className="text-[11px] font-bold">
                        {sectionIdx + 1}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-brand-navy font-heading">
                        {section.name}
                      </h3>
                      {isNoDept && (
                        <p className="text-xs text-text-muted mt-0.5">
                          Servicios transversales sin departamento responsable.
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-text-muted whitespace-nowrap mt-1">
                    {section.items.length}{" "}
                    {section.items.length === 1 ? "servicio" : "servicios"}
                  </span>
                </div>
                <div className="px-5 py-4 space-y-2">
                  {section.items.map((s) => (
                    <ServiceRow
                      key={`${section.id}-${s.id}`}
                      service={s}
                      canManage={initial.canManage}
                      onEdit={() => setEditing(s)}
                      onArchive={() => setPendingArchive(s)}
                      onUnarchive={() => handleUnarchive(s)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {creating && (
        <ServiceFormDialog
          departments={initial.departments}
          onSubmit={handleCreate}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <ServiceFormDialog
          departments={initial.departments}
          initial={editing}
          onSubmit={(input) => handleUpdate(editing.id, input)}
          onClose={() => setEditing(null)}
        />
      )}
      {pendingArchive && (
        <ConfirmDialog
          title="Archivar servicio"
          message={`¿Archivar "${pendingArchive.name}"? Dejará de ofrecerse en nuevos onboardings. Las empresas que ya lo tengan contratado no se ven afectadas. Puedes restaurarlo más tarde.`}
          confirmLabel="Archivar"
          destructive
          onConfirm={async () => {
            await handleArchive(pendingArchive);
            setPendingArchive(null);
          }}
          onCancel={() => setPendingArchive(null)}
        />
      )}
    </div>
  );
}

function ServiceRow({
  service: s,
  canManage,
  onEdit,
  onArchive,
  onUnarchive,
}: {
  service: ServiceCatalogItem;
  canManage: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-gray-100 px-4 py-3 ${
        s.is_active ? "bg-white" : "bg-gray-50"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-sm font-medium ${
              s.is_active ? "text-text-body" : "text-text-muted"
            }`}
          >
            {s.name}
          </span>
          {s.is_load_bearing && (
            <span
              title="Servicio del sistema: el slug está referenciado en código (sidebar cliente, OAuth Dashboard). No se puede renombrar ni archivar."
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded inline-flex items-center gap-1"
            >
              <svg
                width={10}
                height={10}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Sistema
            </span>
          )}
          {!s.is_active && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-gray-200 text-text-muted rounded">
              Archivado
            </span>
          )}
        </div>
        {s.description && (
          <p className="text-xs text-text-muted mt-1 line-clamp-2">
            {s.description}
          </p>
        )}
        <p className="text-[11px] text-text-muted/80 mt-1.5">
          {s.company_count > 0 ? (
            <>
              {s.company_count}{" "}
              {s.company_count === 1
                ? "empresa lo tiene contratado"
                : "empresas lo tienen contratado"}
            </>
          ) : (
            "Sin empresas contratadas"
          )}
        </p>
      </div>
      {canManage && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="text-xs text-text-muted hover:text-brand-teal hover:bg-brand-teal/8 px-2.5 py-1 rounded-md cursor-pointer transition-colors"
          >
            Editar
          </button>
          {s.is_active ? (
            <button
              onClick={onArchive}
              disabled={s.is_load_bearing}
              title={
                s.is_load_bearing
                  ? "Servicio del sistema — no se puede archivar"
                  : undefined
              }
              className="text-xs text-text-muted hover:text-red-600 hover:bg-red-50/60 px-2.5 py-1 rounded-md cursor-pointer transition-colors disabled:text-gray-300 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-300"
            >
              Archivar
            </button>
          ) : (
            <button
              onClick={onUnarchive}
              className="text-xs text-text-muted hover:text-brand-navy hover:bg-brand-navy/5 px-2.5 py-1 rounded-md cursor-pointer transition-colors"
            >
              Restaurar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function sortServices(a: ServiceCatalogItem, b: ServiceCatalogItem): number {
  if (a.display_order !== b.display_order) return a.display_order - b.display_order;
  return a.name.localeCompare(b.name, "es");
}

function computeNextDisplayOrder(services: ServiceCatalogItem[]): number {
  if (services.length === 0) return 100;
  const max = services.reduce(
    (m, s) => (s.display_order > m ? s.display_order : m),
    0
  );
  return max + 10;
}
