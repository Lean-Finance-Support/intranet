"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApartadoTemplate,
  ApartadoTemplateFile,
  ApartadoDepartmentLink,
  DocumentationTag,
} from "@/lib/types/documentation";
import { DOCUMENTATION_EMAIL_TEMPLATES } from "@/lib/documentation/email-templates";

interface Props {
  blockId: string;
  departments: { id: string; name: string }[];
  tags: DocumentationTag[];
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
    is_optional_global: boolean;
    departments: ApartadoDepartmentLink[];
    tag_ids: string[];
    email_template_slug: string | null;
  }) => Promise<void> | void;
  onClose: () => void;
}

export default function ApartadoForm({
  departments,
  tags,
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
  const [deptLinks, setDeptLinks] = useState<ApartadoDepartmentLink[]>(() => {
    if (initial?.departments && initial.departments.length > 0) return initial.departments;
    if (initial?.department_ids) {
      return initial.department_ids.map((id) => ({ department_id: id, is_optional: false }));
    }
    return [];
  });
  const [isOptionalGlobal, setIsOptionalGlobal] = useState(
    initial?.is_optional_global ?? false
  );
  const [tagIds, setTagIds] = useState<string[]>(initial?.tag_ids ?? []);

  // Tag "Solicita Alta de Empresa" requiere que el apartado tenga el dpto
  // Asesoría Laboral entre los seleccionados (o sea global). Si no, lo
  // bloqueamos visualmente y no permitimos seleccionarlo.
  const laboralDeptId = useMemo(
    () => departments.find((d) => d.name === "Asesoría Laboral")?.id ?? null,
    [departments]
  );
  const altaTagId = useMemo(
    () => tags.find((t) => t.slug === "solicita_alta_empresa")?.id ?? null,
    [tags]
  );
  const apartadoCoversLaboral =
    isGlobal ||
    (laboralDeptId !== null &&
      deptLinks.some((d) => d.department_id === laboralDeptId));

  // Si los deptos cambian y el apartado pierde Laboral, des-seleccionamos el tag.
  useEffect(() => {
    if (!apartadoCoversLaboral && altaTagId && tagIds.includes(altaTagId)) {
      setTagIds((prev) => prev.filter((t) => t !== altaTagId));
    }
  }, [apartadoCoversLaboral, altaTagId, tagIds]);
  const [emailTemplateSlug, setEmailTemplateSlug] = useState<string>(
    initial?.email_template_slug ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  function toggleDept(id: string) {
    const isSelected = deptLinks.some((d) => d.department_id === id);
    let next: ApartadoDepartmentLink[];
    if (isSelected) {
      next = deptLinks.filter((d) => d.department_id !== id);
    } else {
      next = [...deptLinks, { department_id: id, is_optional: false }];
    }
    if (departments.length > 0 && next.length === departments.length) {
      // Si el usuario selecciona todos los deptos, lo tratamos como global.
      setIsGlobal(true);
      setDeptLinks([]);
    } else {
      setDeptLinks(next);
    }
  }

  function toggleDeptOptional(id: string) {
    setDeptLinks((prev) =>
      prev.map((d) =>
        d.department_id === id ? { ...d, is_optional: !d.is_optional } : d
      )
    );
  }

  function toggleTag(id: string) {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
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
    if (!isGlobal && deptLinks.length === 0) {
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
        is_optional_global: isGlobal ? isOptionalGlobal : false,
        departments: isGlobal ? [] : deptLinks,
        tag_ids: tagIds,
        email_template_slug: emailTemplateSlug || null,
      });
    } finally {
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
          {isGlobal && (
            <label className="flex items-center gap-2 text-sm text-text-body cursor-pointer mt-2 ml-6">
              <input
                type="checkbox"
                checked={isOptionalGlobal}
                onChange={(e) => setIsOptionalGlobal(e.target.checked)}
              />
              <span>
                Opcional por defecto
                <span className="block text-[11px] text-text-muted/80 leading-snug">
                  No bloquea el progreso si no se adjunta.
                </span>
              </span>
            </label>
          )}
        </div>
        {!isGlobal && (
          <div>
            <p className="text-xs font-medium text-text-muted mb-2">Departamentos *</p>
            <div className="space-y-1.5">
              {departments.map((d) => {
                const link = deptLinks.find((dl) => dl.department_id === d.id);
                const checked = !!link;
                return (
                  <div
                    key={d.id}
                    className={`flex items-center justify-between gap-2 text-sm rounded-lg px-2.5 py-1.5 transition-colors ${
                      checked ? "bg-brand-teal/10" : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDept(d.id)}
                      />
                      <span
                        className={`truncate ${checked ? "text-brand-teal" : "text-text-body"}`}
                      >
                        {d.name}
                      </span>
                    </label>
                    {checked && (
                      <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={link!.is_optional}
                          onChange={() => toggleDeptOptional(d.id)}
                        />
                        Opcional
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-text-muted/80 leading-snug">
              Marcar &laquo;Opcional&raquo; significa que para ese departamento el apartado
              puede no adjuntarse — no cuenta en el progreso.
            </p>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-text-muted mb-2">
            Tags <span className="font-normal text-text-muted/70">(opcional)</span>
          </p>
          {tags.length === 0 ? (
            <p className="text-xs text-text-muted/80 italic">No hay tags todavía.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const active = tagIds.includes(t.id);
                const isAltaTag = t.id === altaTagId;
                const disabled = isAltaTag && !apartadoCoversLaboral;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => !disabled && toggleTag(t.id)}
                    disabled={disabled}
                    title={
                      disabled
                        ? "Este tag solo se puede aplicar si el apartado está vinculado al departamento Asesoría Laboral."
                        : (t.description ?? undefined)
                    }
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      disabled
                        ? "bg-gray-50 text-text-muted/40 border-gray-100 cursor-not-allowed"
                        : active
                          ? "bg-brand-navy text-white border-brand-navy cursor-pointer"
                          : "bg-white text-text-muted border-gray-200 hover:border-gray-300 cursor-pointer"
                    }`}
                  >
                    {t.name}
                    {isAltaTag && (
                      <span className="ml-1 text-[10px] opacity-70">(Laboral)</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-text-muted/80 leading-snug">
            Los tags actúan como condiciones extra en el onboarding: el apartado solo se
            incluirá si todos sus tags se activan en el wizard.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            Plantilla de email asociada{" "}
            <span className="font-normal text-text-muted/70">(opcional)</span>
          </label>
          <select
            value={emailTemplateSlug}
            onChange={(e) => setEmailTemplateSlug(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          >
            <option value="">— Sin plantilla —</option>
            {DOCUMENTATION_EMAIL_TEMPLATES.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
          {emailTemplateSlug && (
            <p className="mt-1 text-[11px] text-text-muted leading-snug">
              {DOCUMENTATION_EMAIL_TEMPLATES.find((t) => t.slug === emailTemplateSlug)?.description}
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-text-muted/80 leading-snug">
            Si seleccionas una plantilla, en la pantalla de Asignación múltiple
            se ofrecerá enviar este email al asignar el apartado.
          </p>
        </div>
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
