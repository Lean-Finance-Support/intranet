"use client";

import { useState } from "react";
import type { ApartadoTemplate } from "@/lib/types/documentation";

interface Props {
  blockId: string;
  departments: { id: string; name: string }[];
  initial?: ApartadoTemplate;
  onSubmit: (input: {
    name: string;
    description: string | null;
    display_order: number;
    is_global: boolean;
    department_ids: string[];
  }) => Promise<void> | void;
  onClose: () => void;
}

export default function ApartadoForm({ departments, initial, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isGlobal, setIsGlobal] = useState(initial?.is_global ?? false);
  const [deptIds, setDeptIds] = useState<string[]>(initial?.department_ids ?? []);
  const [submitting, setSubmitting] = useState(false);

  function toggleDept(id: string) {
    setDeptIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!isGlobal && deptIds.length === 0) {
      alert("Selecciona al menos un departamento o marca el apartado como global.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        display_order: initial?.display_order ?? 0,
        is_global: isGlobal,
        department_ids: isGlobal ? [] : deptIds,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 pointer-events-none">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-full max-w-md p-6 space-y-4 pointer-events-auto"
      >
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">
            {initial ? "Editar apartado" : "Nuevo apartado"}
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Los departamentos seleccionados determinan qué supervisores podrán validar
            la documentación del apartado.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
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
            Descripción <span className="font-normal text-text-muted/70">(opcional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-text-body cursor-pointer">
            <input
              type="checkbox"
              checked={isGlobal}
              onChange={(e) => setIsGlobal(e.target.checked)}
            />
            Apartado global (cualquier departamento)
          </label>
        </div>
        {!isGlobal && (
          <div>
            <p className="text-xs font-medium text-text-muted mb-2">Departamentos *</p>
            <div className="grid grid-cols-2 gap-1.5">
              {departments.map((d) => (
                <label
                  key={d.id}
                  className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                    deptIds.includes(d.id)
                      ? "bg-brand-teal/10 text-brand-teal"
                      : "bg-gray-50 text-text-body hover:bg-gray-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={deptIds.includes(d.id)}
                    onChange={() => toggleDept(d.id)}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-muted hover:text-text-body px-3 py-2 rounded-lg cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="text-sm bg-brand-teal text-white px-4 py-2 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? "Guardando..." : initial ? "Guardar" : "Crear"}
          </button>
        </div>
      </form>
    </div>
  );
}
