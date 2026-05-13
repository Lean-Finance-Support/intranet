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

  const visibleServices = useMemo(
    () => services.filter((s) => (showArchived ? true : s.is_active)),
    [services, showArchived]
  );

  // Agrupar por departamento. Un servicio puede estar en N deptos — aparece en
  // cada sección. Los servicios sin dpto van a NO_DEPT_KEY.
  const groups = useMemo(() => {
    const byDept = new Map<string, ServiceCatalogItem[]>();
    for (const dept of initial.departments) {
      byDept.set(dept.id, []);
    }
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
    display_order: number;
  }) {
    try {
      const { id } = await createService(input);
      const deptNames = initial.departments
        .filter((d) => input.department_ids.includes(d.id))
        .map((d) => d.name);
      const newItem: ServiceCatalogItem = {
        id,
        name: input.name,
        slug: input.slug,
        description: input.description,
        is_active: true,
        display_order: input.display_order,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        department_ids: input.department_ids,
        department_names: deptNames,
        company_count: 0,
        is_load_bearing: false,
      };
      refreshOptimistic((prev) =>
        [...prev, newItem].sort(sortServices)
      );
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
      display_order: number;
    }
  ) {
    try {
      await updateService(id, input);
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
                  display_order: input.display_order,
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

  const sections: { id: string; name: string; items: ServiceCatalogItem[] }[] = [
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
        <p className="text-xs uppercase tracking-wider text-text-muted mb-3">
          Catálogo
        </p>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-brand-navy">
              Catálogo de servicios
            </h1>
            <p className="text-sm text-text-muted mt-2 max-w-2xl">
              Servicios que Lean Finance ofrece a sus clientes. Cada servicio
              puede pertenecer a uno o varios departamentos — los técnicos
              asignados al servicio se gestionan en la ficha de cada cliente.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Mostrar archivados
            </label>
            {initial.canManage && (
              <button
                onClick={() => setCreating(true)}
                className="text-sm px-4 py-2 rounded-lg bg-brand-teal text-white hover:bg-brand-teal/90 cursor-pointer"
              >
                + Nuevo servicio
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {!initial.canManage && (
          <div className="mt-6 text-xs text-text-muted bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Solo lectura. Necesitas el permiso{" "}
            <code className="font-mono">manage_services_catalog</code> para
            editar el catálogo.
          </div>
        )}

        <div className="mt-8 space-y-4">
          {sections.map((section) => (
            <div
              key={section.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm"
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-brand-navy">
                  {section.name}
                </h2>
                <span className="text-xs text-text-muted">
                  {section.items.length}{" "}
                  {section.items.length === 1 ? "servicio" : "servicios"}
                </span>
              </div>
              <div className="px-5 py-4">
                {section.items.length === 0 ? (
                  <p className="text-xs text-text-muted/80 italic py-2">
                    Sin servicios en esta categoría.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {section.items.map((s) => (
                      <li
                        key={`${section.id}-${s.id}`}
                        className={`flex items-start gap-3 border border-gray-100 rounded-xl px-3 py-2.5 ${
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
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-100 text-text-muted rounded">
                              {s.slug}
                            </span>
                            {s.is_load_bearing && (
                              <span
                                title="Referenciado en código"
                                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded"
                              >
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
                            {s.company_count}{" "}
                            {s.company_count === 1
                              ? "empresa lo tiene contratado"
                              : "empresas lo tienen contratado"}
                          </p>
                        </div>
                        {initial.canManage && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => setEditing(s)}
                              className="text-xs text-brand-teal hover:bg-brand-teal/10 rounded-lg px-2.5 py-1.5 cursor-pointer"
                            >
                              Editar
                            </button>
                            {s.is_active ? (
                              <button
                                onClick={() => setPendingArchive(s)}
                                disabled={s.is_load_bearing}
                                title={
                                  s.is_load_bearing
                                    ? "Servicio referenciado en código"
                                    : undefined
                                }
                                className="text-xs text-red-600 hover:bg-red-50 rounded-lg px-2.5 py-1.5 cursor-pointer disabled:text-gray-300 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              >
                                Archivar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUnarchive(s)}
                                className="text-xs text-brand-navy hover:bg-brand-navy/5 rounded-lg px-2.5 py-1.5 cursor-pointer"
                              >
                                Restaurar
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
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
          message={`¿Archivar "${pendingArchive.name}"? Dejará de ofrecerse en nuevos onboardings. Los clientes que ya lo tengan contratado no se ven afectados.`}
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

function sortServices(a: ServiceCatalogItem, b: ServiceCatalogItem): number {
  if (a.display_order !== b.display_order) return a.display_order - b.display_order;
  return a.name.localeCompare(b.name, "es");
}
