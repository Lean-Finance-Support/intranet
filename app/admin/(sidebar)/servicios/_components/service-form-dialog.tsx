"use client";

import { useEffect, useState } from "react";
import type { ServiceCatalogItem } from "@/lib/types/services";

interface Props {
  departments: { id: string; name: string }[];
  initial?: ServiceCatalogItem;
  onSubmit: (input: {
    name: string;
    slug: string;
    description: string | null;
    department_ids: string[];
    display_order: number;
  }) => Promise<void> | void;
  onClose: () => void;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ServiceFormDialog({
  departments,
  initial,
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!initial);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [deptIds, setDeptIds] = useState<string[]>(initial?.department_ids ?? []);
  const [displayOrder, setDisplayOrder] = useState<number>(
    initial?.display_order ?? 100
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoadBearing = initial?.is_load_bearing ?? false;

  useEffect(() => {
    if (slugTouched || initial) return;
    setSlug(slugify(name));
  }, [name, slugTouched, initial]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  function toggleDept(id: string) {
    setDeptIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        department_ids: deptIds,
        display_order: Number.isFinite(displayOrder) ? displayOrder : 100,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 pointer-events-none">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-full max-w-md p-6 space-y-4 pointer-events-auto max-h-[90vh] overflow-y-auto"
      >
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">
            {initial ? "Editar servicio" : "Nuevo servicio"}
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Los servicios que pertenecen a un departamento permiten asignar
            técnicos del equipo. Un servicio puede no tener departamento
            (transversal).
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            Nombre *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            Slug *{" "}
            {isLoadBearing && (
              <span
                className="ml-1 text-[10px] uppercase tracking-wider text-amber-600"
                title="Referenciado en código — no se puede cambiar"
              >
                bloqueado
              </span>
            )}
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            disabled={isLoadBearing}
            required
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal disabled:bg-gray-50 disabled:text-text-muted disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-[11px] text-text-muted/80">
            Identificador URL-safe. Solo minúsculas, números y guiones.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            Descripción{" "}
            <span className="font-normal text-text-muted/70">(opcional)</span>
          </label>
          <textarea
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
        </div>

        <div>
          <p className="text-xs font-medium text-text-muted mb-2">
            Departamentos{" "}
            <span className="font-normal text-text-muted/70">(opcional)</span>
          </p>
          <div className="space-y-1.5">
            {departments.map((d) => {
              const checked = deptIds.includes(d.id);
              return (
                <label
                  key={d.id}
                  className={`flex items-center gap-2 text-sm rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors ${
                    checked ? "bg-brand-teal/10" : "bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDept(d.id)}
                  />
                  <span
                    className={`truncate ${
                      checked ? "text-brand-teal" : "text-text-body"
                    }`}
                  >
                    {d.name}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted/80 leading-snug">
            Un servicio sin departamento se ofrecerá como transversal — no
            tendrá técnicos asignables.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            Orden de visualización
          </label>
          <input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(Number(e.target.value))}
            min={0}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm px-4 py-2 rounded-lg text-text-muted hover:bg-gray-100 cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="text-sm px-4 py-2 rounded-lg bg-brand-teal text-white hover:bg-brand-teal/90 cursor-pointer disabled:opacity-50"
          >
            {submitting ? "Guardando..." : initial ? "Guardar cambios" : "Crear servicio"}
          </button>
        </div>
      </form>
    </div>
  );
}
