"use client";

import { useState } from "react";
import type { BlockTemplate } from "@/lib/types/documentation";

interface Props {
  initial?: BlockTemplate;
  onSubmit: (input: {
    name: string;
    slug: string;
    description: string | null;
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
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export default function BlockForm({ initial, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        // Slug auto-generado a partir del nombre. Si ya existía y se edita el
        // nombre, conservamos el slug original (los slugs no cambian solos para
        // evitar romper referencias).
        slug: initial?.slug ?? slugify(name),
        description: description.trim() || null,
        display_order: initial?.display_order ?? 0,
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
            {initial ? "Editar bloque" : "Nuevo bloque"}
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Un bloque agrupa apartados. Se asigna a clientes desde la página del cliente.
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
