"use client";

import { useRef, useState } from "react";
import type { ApartadoTemplate, ApartadoTemplateFile } from "@/lib/types/documentation";

interface Props {
  blockId: string;
  departments: { id: string; name: string }[];
  initial?: ApartadoTemplate;
  templates?: ApartadoTemplateFile[];
  onUploadTemplate?: (file: File) => Promise<void> | void;
  onDeleteTemplate?: (templateId: string) => Promise<void> | void;
  onDownloadTemplate?: (templateId: string) => Promise<string>;
  onSubmit: (input: {
    name: string;
    description: string | null;
    display_order: number;
    is_global: boolean;
    department_ids: string[];
  }) => Promise<void> | void;
  onClose: () => void;
}

export default function ApartadoForm({
  departments,
  initial,
  templates,
  onUploadTemplate,
  onDeleteTemplate,
  onDownloadTemplate,
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isGlobal, setIsGlobal] = useState(initial?.is_global ?? false);
  const [deptIds, setDeptIds] = useState<string[]>(initial?.department_ids ?? []);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  function toggleDept(id: string) {
    const next = deptIds.includes(id) ? deptIds.filter((d) => d !== id) : [...deptIds, id];
    if (departments.length > 0 && next.length === departments.length) {
      setIsGlobal(true);
      setDeptIds([]);
    } else {
      setDeptIds(next);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !onUploadTemplate) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        await onUploadTemplate(f);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownloadTemplate(templateId: string) {
    if (!onDownloadTemplate) return;
    const url = await onDownloadTemplate(templateId);
    window.open(url, "_blank", "noopener,noreferrer");
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
        {onUploadTemplate && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-text-muted mb-2">Plantillas</p>
            {!initial ? (
              <p className="text-xs text-text-muted/80 italic">
                Guarda el apartado y reábrelo para añadir plantillas.
              </p>
            ) : (
              <div className="space-y-1.5">
                {(templates ?? []).length === 0 && (
                  <p className="text-xs text-text-muted/80 italic">
                    No hay plantillas todavía.
                  </p>
                )}
                {(templates ?? []).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-lg px-2.5 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate(t.id)}
                      className="text-brand-teal hover:underline cursor-pointer truncate text-left flex-1"
                      title={t.file_name}
                    >
                      {t.file_name}
                    </button>
                    {onDeleteTemplate && (
                      <button
                        type="button"
                        onClick={() => onDeleteTemplate(t.id)}
                        className="w-4 h-4 rounded-full text-text-muted hover:text-red-500 hover:bg-red-50 cursor-pointer flex items-center justify-center transition-colors flex-shrink-0"
                        title="Eliminar plantilla"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs text-brand-teal hover:text-brand-teal/80 px-2.5 py-1 rounded-lg border border-dashed border-brand-teal/40 hover:border-brand-teal/60 disabled:opacity-50 cursor-pointer mt-1"
                >
                  {uploading ? "Subiendo..." : "+ Añadir plantilla"}
                </button>
              </div>
            )}
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
