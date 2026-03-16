"use client";

import { useState, useEffect, useCallback } from "react";
import { getModelsWithEntries, saveEntries } from "../actions";
import type { TaxModelWithEntry } from "@/lib/types/tax";

interface ModelsFormProps {
  companyId: string;
  quarter: number;
  year?: number;
}

interface LocalEntry {
  tax_model_id: string;
  model_code: string;
  description: string | null;
  amount: string;
  entry_type: "pagar" | "percibir";
  dirty: boolean;
}

export default function ModelsForm({ companyId, quarter, year = 2026 }: ModelsFormProps) {
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setSavedMessage("");
    try {
      const models = await getModelsWithEntries(companyId, year, quarter);
      setEntries(
        models.map((m: TaxModelWithEntry) => ({
          tax_model_id: m.id,
          model_code: m.model_code,
          description: m.description,
          amount: m.entry?.amount?.toString() ?? "",
          entry_type: m.entry?.entry_type ?? "pagar",
          dirty: false,
        }))
      );
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
      prev.map((e, i) =>
        i === index ? { ...e, [field]: value, dirty: true } : e
      )
    );
  }

  async function handleSave() {
    const toSave = entries
      .filter((e) => e.amount !== "" && e.dirty)
      .map((e) => ({
        tax_model_id: e.tax_model_id,
        company_id: companyId,
        amount: parseFloat(e.amount),
        entry_type: e.entry_type as "pagar" | "percibir",
      }));

    if (toSave.length === 0) return;

    setSaving(true);
    setSavedMessage("");
    try {
      await saveEntries(toSave);
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

  const hasDirty = entries.some((e) => e.dirty && e.amount !== "");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Modelo</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Importe (€)</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.tax_model_id} className="border-b border-gray-100">
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
                    onChange={(e) => updateEntry(index, "amount", e.target.value)}
                    placeholder="0,00"
                    className="w-36 px-3 py-2 rounded-lg border border-gray-200 text-text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal"
                  />
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`type-${entry.tax_model_id}`}
                        checked={entry.entry_type === "pagar"}
                        onChange={() => updateEntry(index, "entry_type", "pagar")}
                        className="accent-brand-teal"
                      />
                      <span className="text-sm text-text-body">A pagar</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`type-${entry.tax_model_id}`}
                        checked={entry.entry_type === "percibir"}
                        onChange={() => updateEntry(index, "entry_type", "percibir")}
                        className="accent-brand-teal"
                      />
                      <span className="text-sm text-text-body">A percibir</span>
                    </label>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
