"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getClientQuarterData,
  getBankAccounts,
  saveClientResponses,
  submitQuarter,
} from "../actions";
import type { TaxEntryForClient } from "@/lib/types/tax";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";
import AddBankAccountModal from "./add-bank-account-modal";

interface ModelsClientListProps {
  quarter: number;
  year?: number;
}

interface LocalEntry extends TaxEntryForClient {
  approved: boolean;
  selectedBankAccountId: string;
  dirty: boolean;
}

export default function ModelsClientList({ quarter, year = 2026 }: ModelsClientListProps) {
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [notified, setNotified] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [showAddAccount, setShowAddAccount] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [quarterData, accounts] = await Promise.all([
        getClientQuarterData(year, quarter),
        getBankAccounts(),
      ]);

      setNotified(quarterData.notified);
      setSubmitted(quarterData.submitted);
      setSubmittedAt(quarterData.submitted_at);
      setBankAccounts(accounts);

      const defaultAccount = accounts.find((a) => a.is_default);

      setEntries(
        quarterData.entries.map((e) => ({
          ...e,
          approved: e.client_response?.approved ?? false,
          selectedBankAccountId:
            e.client_response?.bank_account_id ?? defaultAccount?.id ?? "",
          dirty: false,
        }))
      );
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  }, [quarter, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleApproval(index: number) {
    if (submitted) return;
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index ? { ...e, approved: !e.approved, dirty: true } : e
      )
    );
  }

  function changeBankAccount(index: number, bankAccountId: string) {
    if (submitted) return;
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index ? { ...e, selectedBankAccountId: bankAccountId, dirty: true } : e
      )
    );
  }

  async function handleSave() {
    const toSave = entries
      .filter((e) => e.dirty && e.approved && e.selectedBankAccountId)
      .map((e) => ({
        tax_entry_id: e.id,
        bank_account_id: e.selectedBankAccountId,
        approved: e.approved,
      }));

    if (toSave.length === 0) return;

    setSaving(true);
    setMessage("");
    try {
      await saveClientResponses(toSave);
      setEntries((prev) => prev.map((e) => ({ ...e, dirty: false })));
      setMessage("Guardado correctamente");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Error guardando:", err);
      setMessage("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    // All entries must be approved with a bank account
    const allReady = entries.every((e) => e.approved && e.selectedBankAccountId);
    if (!allReady) {
      setMessage("Debes aprobar todos los modelos y seleccionar un IBAN para cada uno");
      setTimeout(() => setMessage(""), 5000);
      return;
    }

    // Save any unsaved changes first
    const unsaved = entries.filter((e) => e.dirty);
    if (unsaved.length > 0) {
      await saveClientResponses(
        unsaved.map((e) => ({
          tax_entry_id: e.id,
          bank_account_id: e.selectedBankAccountId,
          approved: e.approved,
        }))
      );
    }

    setSubmitting(true);
    setMessage("");
    try {
      await submitQuarter(year, quarter);
      setSubmitted(true);
      setSubmittedAt(new Date().toISOString());
      setEntries((prev) => prev.map((e) => ({ ...e, dirty: false })));
      setMessage("Enviado correctamente al asesor fiscal");
    } catch (err) {
      console.error("Error enviando:", err);
      setMessage("Error al enviar");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAccountAdded(account: CompanyBankAccount) {
    setBankAccounts((prev) => [...prev, account]);
    setShowAddAccount(false);
  }

  function formatAmount(amount: number): string {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!notified) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-text-muted">
          Aún no se han completado los modelos de impuestos para este trimestre.
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">
          No hay modelos con importe asignado para este trimestre.
        </p>
      </div>
    );
  }

  const hasDirty = entries.some((e) => e.dirty);
  const allApproved = entries.every((e) => e.approved && e.selectedBankAccountId);

  return (
    <div>
      {submitted && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <p className="text-sm font-medium text-green-800">Enviado al asesor fiscal</p>
            {submittedAt && (
              <p className="text-xs text-green-600">
                {new Date(submittedAt).toLocaleString("es-ES")}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            className={`border rounded-xl p-4 transition-colors ${
              entry.approved
                ? "border-green-200 bg-green-50/50"
                : "border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-body">{entry.model_code}</span>
                  <span
                    className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                      entry.entry_type === "pagar"
                        ? "bg-red-50 text-red-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {entry.entry_type === "pagar" ? "A pagar" : "A percibir"}
                  </span>
                </div>
                {entry.description && (
                  <p className="text-xs text-text-muted mt-1">{entry.description}</p>
                )}
                <p className="text-lg font-semibold text-brand-navy mt-2">
                  {formatAmount(entry.amount)}
                </p>
              </div>

              <button
                onClick={() => toggleApproval(index)}
                disabled={submitted}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  submitted
                    ? "cursor-default"
                    : "cursor-pointer hover:opacity-80"
                } ${
                  entry.approved
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-text-muted"
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>

            {/* IBAN selector */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <label className="block text-xs font-medium text-text-muted mb-1">
                Cuenta de destino
              </label>
              <div className="flex gap-2">
                <select
                  value={entry.selectedBankAccountId}
                  onChange={(e) => changeBankAccount(index, e.target.value)}
                  disabled={submitted}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal disabled:bg-gray-50 disabled:cursor-not-allowed"
                >
                  <option value="">Seleccionar cuenta...</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.iban}
                      {account.label ? ` — ${account.label}` : ""}
                    </option>
                  ))}
                </select>
                {!submitted && (
                  <button
                    onClick={() => setShowAddAccount(true)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-text-muted hover:bg-gray-50 transition-colors"
                    title="Añadir cuenta"
                  >
                    +
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {!submitted && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-6 pt-6 border-t border-gray-200">
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={!hasDirty || saving}
              className="px-5 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-text-body hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Guardando..." : "Guardar borrador"}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!allApproved || submitting}
              className="px-6 py-2.5 bg-brand-teal text-white rounded-lg text-sm font-medium hover:bg-brand-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Enviando..." : "Enviar al asesor"}
            </button>
          </div>
          {message && (
            <span className={`text-sm ${message.includes("Error") || message.includes("Debes") ? "text-red-500" : "text-green-600"}`}>
              {message}
            </span>
          )}
        </div>
      )}

      {showAddAccount && (
        <AddBankAccountModal
          onClose={() => setShowAddAccount(false)}
          onAdded={handleAccountAdded}
        />
      )}
    </div>
  );
}
