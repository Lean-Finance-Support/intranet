"use client";

import { useEffect, useState } from "react";

interface CompetidorEntry {
  comercial: string;
  fiscal: string;
  cif: string;
}

interface Props {
  mode: "client" | "admin";
  // Si false, el listado se muestra deshabilitado (solo lectura).
  canEdit: boolean;
  stored: CompetidorEntry[] | null;
  onSubmit?: (entries: CompetidorEntry[]) => Promise<void>;
}

const EMPTY_ENTRY: CompetidorEntry = { comercial: "", fiscal: "", cif: "" };

export default function CompetidoresForm({
  mode,
  canEdit,
  stored,
  onSubmit,
}: Props) {
  // Si no hay nada guardado y el usuario puede editar, empezamos con una
  // entrada vacía para que vea el formulario directamente.
  const initial: CompetidorEntry[] =
    stored && stored.length > 0
      ? stored
      : canEdit
        ? [{ ...EMPTY_ENTRY }]
        : [];
  const [entries, setEntries] = useState<CompetidorEntry[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sincronizar el estado local cuando llega un refresh (p.ej. tras validar/rechazar).
  useEffect(() => {
    if (stored && stored.length > 0) setEntries(stored);
  }, [stored]);

  const disabled = !canEdit || submitting;

  function updateField(index: number, key: keyof CompetidorEntry, value: string) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [key]: value } : e))
    );
  }

  function addEntry() {
    setEntries((prev) => [...prev, { ...EMPTY_ENTRY }]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Si quitamos la última y el usuario aún puede editar, dejamos una vacía
      // para que no se quede sin UI dónde escribir.
      if (next.length === 0 && canEdit) return [{ ...EMPTY_ENTRY }];
      return next;
    });
  }

  function isEntryEmpty(e: CompetidorEntry) {
    return !e.comercial.trim() && !e.fiscal.trim() && !e.cif.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmit) return;
    setError(null);

    const trimmed = entries.map((entry) => ({
      comercial: entry.comercial.trim(),
      fiscal: entry.fiscal.trim(),
      cif: entry.cif.trim(),
    }));
    // Descartamos entradas totalmente vacías sin avisar. El total puede ser 0
    // ("no tengo competidores").
    const cleaned = trimmed.filter((e) => !isEntryEmpty(e));

    setSubmitting(true);
    try {
      await onSubmit(cleaned);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  // Vista admin SIN canEdit: tabla compacta read-only (lo de antes).
  if (mode === "admin" && !canEdit) {
    if (!stored || stored.length === 0) {
      return (
        <section>
          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">
            Competidores
          </p>
          <p className="text-sm text-text-muted italic">
            El cliente aún no ha indicado competidores.
          </p>
        </section>
      );
    }
    return (
      <section>
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">
          Competidores
          <span className="font-normal normal-case tracking-normal text-text-muted/80">
            {" · "}
            {stored.length}
          </span>
        </p>
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-left px-3 py-2">Comercial / web</th>
                <th className="text-left px-3 py-2">Fiscal</th>
                <th className="text-left px-3 py-2">CIF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stored.map((entry, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 text-text-muted">{idx + 1}</td>
                  <td className="px-3 py-2 text-text-body">{entry.comercial || <span className="text-text-muted italic">—</span>}</td>
                  <td className="px-3 py-2 text-text-body">{entry.fiscal || <span className="text-text-muted italic">—</span>}</td>
                  <td className="px-3 py-2 text-text-body">{entry.cif || <span className="text-text-muted italic">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
          Competidores
          <span className="font-normal normal-case tracking-normal text-text-muted/80">
            {" · "}
            {entries.length}
          </span>
        </p>
        <p className="text-[11px] text-text-muted">
          Las filas vacías se descartan al guardar.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          {entries.map((entry, idx) => (
            <div
              key={idx}
              className="bg-white border border-gray-200 rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                  #{idx + 1}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeEntry(idx)}
                    disabled={submitting}
                    className="text-[11px] text-text-muted hover:text-red-600 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 6l12 12M6 18L18 6" />
                    </svg>
                    Quitar
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-text-muted mb-1">
                    Nombre comercial / web
                  </label>
                  <input
                    type="text"
                    value={entry.comercial}
                    onChange={(e) => updateField(idx, "comercial", e.target.value)}
                    disabled={disabled}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-teal disabled:bg-gray-50 disabled:text-text-muted"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-text-muted mb-1">
                    Nombre fiscal
                  </label>
                  <input
                    type="text"
                    value={entry.fiscal}
                    onChange={(e) => updateField(idx, "fiscal", e.target.value)}
                    disabled={disabled}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-teal disabled:bg-gray-50 disabled:text-text-muted"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-text-muted mb-1">
                    CIF
                  </label>
                  <input
                    type="text"
                    value={entry.cif}
                    onChange={(e) => updateField(idx, "cif", e.target.value)}
                    disabled={disabled}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-teal disabled:bg-gray-50 disabled:text-text-muted"
                  />
                </div>
              </div>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-sm text-text-muted italic">
              Sin competidores indicados.
            </p>
          )}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={addEntry}
            disabled={submitting}
            className="text-xs font-medium text-brand-teal hover:bg-brand-teal/10 bg-brand-teal/5 px-3 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Añadir competidor
          </button>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        {canEdit && onSubmit && (
          <div>
            <button
              type="submit"
              disabled={submitting}
              className="text-sm font-semibold text-white px-4 py-2 rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2 bg-brand-teal"
            >
              {submitting
                ? "Guardando…"
                : stored && stored.length > 0
                  ? "Actualizar competidores"
                  : "Guardar y enviar"}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
