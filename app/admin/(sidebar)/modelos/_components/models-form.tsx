"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { getModelsWithEntries, saveEntries, deleteEntry, getClientResponses, getQuarterComment, saveQuarterComment } from "../actions";
import type { ClientResponseStatus } from "../actions";
import type { TaxModelWithEntry } from "@/lib/types/tax";

export interface ModelsFormHandle {
  saveIfDirty: () => Promise<void>;
}

interface ModelsFormProps {
  companyId: string;
  quarter: number;
  year?: number;
  canEdit?: boolean;
  presented?: boolean;
  onClientDataLoaded?: (data: { allAccepted: boolean; submitted: boolean }) => void;
}

interface LocalEntry {
  tax_model_id: string;
  model_code: string;
  description: string | null;
  amount: string;
  entry_type: "pagar" | "percibir";
  is_informative: boolean;
  selected: boolean; // for informative models: whether included in the notification
  deferment_allowed: boolean;
  dirty: boolean;
}

const ModelsForm = forwardRef<ModelsFormHandle, ModelsFormProps>(function ModelsForm(
  { companyId, quarter, year = 2026, canEdit = true, presented = false, onClientDataLoaded }: ModelsFormProps,
  ref
) {
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [clientResponses, setClientResponses] = useState<{
    submitted: boolean;
    submitted_at: string | null;
    responses: ClientResponseStatus[];
  }>({ submitted: false, submitted_at: null, responses: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [comment, setComment] = useState("");
  const [commentInitial, setCommentInitial] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setSavedMessage("");
    try {
      const [models, clientData, commentData] = await Promise.all([
        getModelsWithEntries(companyId, year, quarter),
        getClientResponses(companyId, year, quarter),
        getQuarterComment(companyId, year, quarter),
      ]);
      setComment(commentData.comment_text);
      setCommentInitial(commentData.comment_text);
      setEntries(
        models.map((m: TaxModelWithEntry) => ({
          tax_model_id: m.id,
          model_code: m.model_code,
          description: m.description,
          // For informative models: show amount only if > 0 (amount=0 means "selected with no amount")
          amount: m.is_informative
            ? (m.entry?.amount && Number(m.entry.amount) !== 0 ? m.entry.amount.toString() : "")
            : (m.entry?.amount?.toString() ?? ""),
          entry_type: m.entry?.entry_type ?? "pagar",
          is_informative: m.is_informative ?? false,
          selected: m.is_informative ? m.entry !== null : true,
          deferment_allowed: m.entry?.deferment_allowed ?? false,
          dirty: false,
        }))
      );
      setClientResponses(clientData);
      onClientDataLoaded?.({
        allAccepted: clientData.allAccepted,
        submitted: clientData.submitted,
      });
    } catch (err) {
      console.error("Error cargando modelos:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, quarter, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updateEntry(index: number, field: "amount" | "entry_type", value: string) {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== index) return e;
        // Auto-select informative models when an amount is typed
        if (field === "amount" && e.is_informative && value !== "") {
          return { ...e, [field]: value, selected: true, dirty: true };
        }
        return { ...e, [field]: value, dirty: true };
      })
    );
  }

  function updateInformativeSelection(index: number, checked: boolean) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, selected: checked, amount: checked ? e.amount : "", dirty: true }
          : e
      )
    );
  }

  function updateDefermentAllowed(index: number, checked: boolean) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index ? { ...e, deferment_allowed: checked, dirty: true } : e
      )
    );
  }

  async function handleSave() {
    const toSave: { tax_model_id: string; company_id: string; amount: number; entry_type: "pagar" | "percibir"; deferment_allowed: boolean }[] = [];
    const toDelete: string[] = [];

    for (const e of entries) {
      if (!e.dirty) continue;
      if (e.is_informative) {
        if (e.selected) {
          toSave.push({
            tax_model_id: e.tax_model_id,
            company_id: companyId,
            amount: e.amount !== "" ? parseFloat(e.amount) : 0,
            entry_type: e.entry_type as "pagar" | "percibir",
            deferment_allowed: false,
          });
        } else {
          toDelete.push(e.tax_model_id);
        }
      } else {
        if (e.amount !== "") {
          toSave.push({
            tax_model_id: e.tax_model_id,
            company_id: companyId,
            amount: parseFloat(e.amount),
            entry_type: e.entry_type as "pagar" | "percibir",
            deferment_allowed: e.deferment_allowed,
          });
        }
      }
    }

    const commentDirty = comment !== commentInitial;
    if (toSave.length === 0 && toDelete.length === 0 && !commentDirty) return;

    setSaving(true);
    setSavedMessage("");
    try {
      if (toSave.length > 0) await saveEntries(toSave);
      for (const taxModelId of toDelete) await deleteEntry(companyId, taxModelId);
      if (commentDirty) {
        await saveQuarterComment(companyId, year, quarter, comment);
        setCommentInitial(comment);
      }
      setEntries((prev) => prev.map((e) => ({ ...e, dirty: false })));
      setSavedMessage("Guardado correctamente");
      setTimeout(() => setSavedMessage(""), 3000);
    } catch (err) {
      console.error("Error guardando:", err);
      setSavedMessage("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const hasDirty =
    entries.some((e) => (e.is_informative ? e.dirty : e.dirty && e.amount !== "")) ||
    comment !== commentInitial;

  useImperativeHandle(ref, () => ({
    saveIfDirty: async () => {
      const toSave: { tax_model_id: string; company_id: string; amount: number; entry_type: "pagar" | "percibir"; deferment_allowed: boolean }[] = [];
      const toDelete: string[] = [];
      for (const e of entries) {
        if (!e.dirty) continue;
        if (e.is_informative) {
          if (e.selected) {
            toSave.push({ tax_model_id: e.tax_model_id, company_id: companyId, amount: e.amount !== "" ? parseFloat(e.amount) : 0, entry_type: e.entry_type as "pagar" | "percibir", deferment_allowed: false });
          } else {
            toDelete.push(e.tax_model_id);
          }
        } else {
          if (e.amount !== "") {
            toSave.push({ tax_model_id: e.tax_model_id, company_id: companyId, amount: parseFloat(e.amount), entry_type: e.entry_type as "pagar" | "percibir", deferment_allowed: e.deferment_allowed });
          }
        }
      }
      if (toSave.length > 0) await saveEntries(toSave);
      for (const taxModelId of toDelete) await deleteEntry(companyId, taxModelId);
      if (comment !== commentInitial) {
        await saveQuarterComment(companyId, year, quarter, comment);
        setCommentInitial(comment);
      }
      setEntries((prev) => prev.map((e) => ({ ...e, dirty: false })));
    },
  }), [entries, companyId, comment, commentInitial, year, quarter]);

  // Build a map of tax_model_id → client response for quick lookup
  const responsesByModel = new Map(
    clientResponses.responses.map((r) => [r.tax_model_id, r])
  );

  if (loading) {
    return (
      <div className="animate-pulse">
        <div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                {["Modelo", "Importe (€)", "Tipo", "Respuesta cliente"].map((h) => (
                  <th key={h} className="text-left py-3 px-4">
                    <div className="h-3 w-20 bg-gray-200 rounded" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3 px-4"><div className="h-4 w-16 bg-gray-100 rounded" /></td>
                  <td className="py-3 px-4"><div className="h-9 w-36 bg-gray-100 rounded-lg" /></td>
                  <td className="py-3 px-4"><div className="h-4 w-28 bg-gray-100 rounded" /></td>
                  <td className="py-3 px-4"><div className="h-4 w-12 bg-gray-100 rounded" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Banner presentación — bloqueo definitivo */}
      {presented && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-brand-navy/5 border border-brand-navy/20 flex items-center gap-2">
          <svg className="w-4 h-4 text-brand-navy shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-brand-navy">Modelos presentados — este trimestre ya no admite cambios</span>
        </div>
      )}

      {/* Banner solo lectura (no asignado) */}
      {!canEdit && !presented && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <span className="text-sm text-text-muted">Solo lectura — no estás asignado como técnico de esta empresa</span>
        </div>
      )}

      {/* Client submission banner */}
      {clientResponses.submitted && !presented && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-green-800 font-medium">
              El cliente ha enviado sus respuestas
              {clientResponses.submitted_at && (
                <span className="font-normal text-green-600 ml-1">
                  — {new Date(clientResponses.submitted_at).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      <div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Modelo</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Importe (€)</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Tipo</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Respuesta cliente</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const response = responsesByModel.get(entry.tax_model_id);
              return (
                <tr
                  key={entry.tax_model_id}
                  className="border-b border-gray-100 animate-fade-in-up"
                  style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
                >
                  <td className="py-3 px-4">
                    <span className="font-medium text-text-body">{entry.model_code}</span>
                    {entry.description && (
                      <p className="text-xs text-text-muted mt-0.5">{entry.description}</p>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={entry.amount}
                      onChange={(e) => canEdit && !presented && updateEntry(index, "amount", e.target.value)}
                      placeholder="0,00"
                      readOnly={!canEdit || presented}
                      className={`w-36 px-3 py-2 rounded-lg border text-text-body font-mono focus:outline-none transition-colors ${
                        canEdit && !presented
                          ? "border-gray-200 focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal"
                          : "border-gray-100 bg-gray-50 text-text-muted cursor-default"
                      }`}
                    />
                  </td>
                  <td className="py-3 px-4">
                    {entry.is_informative ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-sm text-text-muted italic">Informativo</span>
                        {canEdit && !presented ? (
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={entry.selected}
                              onChange={(e) => updateInformativeSelection(index, e.target.checked)}
                              className="accent-brand-teal"
                            />
                            <span className="text-xs text-text-muted">Incluir</span>
                          </label>
                        ) : entry.selected ? (
                          <span className="text-xs text-green-600 font-medium">Incluido</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex gap-4">
                          <label className={`flex items-center gap-1.5 ${canEdit && !presented ? "cursor-pointer" : "cursor-default opacity-60"}`}>
                            <input
                              type="radio"
                              name={`type-${entry.tax_model_id}`}
                              checked={entry.entry_type === "pagar"}
                              onChange={() => canEdit && !presented && updateEntry(index, "entry_type", "pagar")}
                              disabled={!canEdit || presented}
                              className="accent-brand-teal"
                            />
                            <span className="text-sm text-text-body">A pagar</span>
                          </label>
                          <label className={`flex items-center gap-1.5 ${canEdit && !presented ? "cursor-pointer" : "cursor-default opacity-60"}`}>
                            <input
                              type="radio"
                              name={`type-${entry.tax_model_id}`}
                              checked={entry.entry_type === "percibir"}
                              onChange={() => canEdit && !presented && updateEntry(index, "entry_type", "percibir")}
                              disabled={!canEdit || presented}
                              className="accent-brand-teal"
                            />
                            <span className="text-sm text-text-body">A compensar</span>
                          </label>
                        </div>
                        {entry.model_code === "303"
                          && entry.entry_type === "pagar"
                          && entry.amount !== ""
                          && parseFloat(entry.amount) > 0 && (
                            canEdit && !presented ? (
                              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={entry.deferment_allowed}
                                  onChange={(e) => updateDefermentAllowed(index, e.target.checked)}
                                  className="accent-brand-teal"
                                />
                                <span className="text-xs text-text-muted">Incluir posibilidad de aplazamiento</span>
                              </label>
                            ) : entry.deferment_allowed ? (
                              <span className="text-xs text-brand-teal font-medium">Aplazamiento disponible</span>
                            ) : null
                          )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {!response ? (
                      <span className="text-xs text-text-muted">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                          response.status === "accepted"
                            ? "text-green-700"
                            : response.status === "rejected"
                              ? "text-red-700"
                              : "text-amber-700"
                        }`}>
                          {response.status === "accepted" ? (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : response.status === "rejected" ? (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
                            </svg>
                          )}
                          {response.status === "accepted" ? "Aceptado" : response.status === "rejected" ? "Rechazado" : "Pendiente"}
                        </span>
                        {response.bank_account_iban && (
                          <span className="text-xs text-text-muted font-mono">
                            {response.bank_account_label && (
                              <span className="font-sans text-text-body mr-1">{response.bank_account_label}:</span>
                            )}
                            {response.bank_account_iban.replace(/(.{4})/g, "$1 ").trim()}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <label className="block text-sm font-medium text-text-body mb-1.5">
          Observaciones del trimestre
          <span className="ml-2 text-xs font-normal text-text-muted">Visible para el cliente cuando se le notifique</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => canEdit && !presented && setComment(e.target.value)}
          readOnly={!canEdit || presented}
          rows={3}
          placeholder="Añade observaciones para el cliente sobre este trimestre (opcional)"
          className={`w-full px-3 py-2 rounded-lg border text-sm text-text-body focus:outline-none transition-colors ${
            canEdit && !presented
              ? "border-gray-200 focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal"
              : "border-gray-100 bg-gray-50 text-text-muted cursor-default"
          }`}
        />
      </div>

      {canEdit && !presented && (
        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={handleSave}
            disabled={!hasDirty || saving}
            className="px-6 py-2.5 bg-brand-teal text-white rounded-lg font-medium text-sm hover:bg-brand-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          {savedMessage && (
            <span className={`text-sm ${savedMessage.includes("Error") ? "text-red-500" : "text-green-600"}`}>
              {savedMessage}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default ModelsForm;
