"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getClientQuarterData,
  getBankAccounts,
  saveClientResponses,
  submitQuarter,
  getAdvisorContactInfo,
} from "../actions";
import type { TaxEntryForClient, TaxModelStatus } from "@/lib/types/tax";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";
import AddBankAccountModal from "./add-bank-account-modal";

interface ModelsClientListProps {
  quarter: number;
  year?: number;
  onHeaderState?: (state: {
    advisorEmails: string[];
    companyName: string;
    presented: boolean;
    submittedAt: string | null;
  }) => void;
}

interface LocalEntry extends TaxEntryForClient {
  status: TaxModelStatus;
  selectedBankAccountId: string;
  dirty: boolean;
  ibanError: boolean; // tried to accept without IBAN
  defermentRequested: boolean;
  defermentInstallments: number; // 1-12
  defermentDay: 5 | 20;
  defermentMonthKey: string; // "YYYY-MM"
}

const MONTH_NAMES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

interface UpcomingMonth {
  key: string; // "YYYY-MM"
  label: string;
  year: number;
  month: number; // 1-12
}

function getUpcomingMonths(from: Date = new Date()): UpcomingMonth[] {
  // Los tres meses siguientes al actual (sin contar el mes en curso)
  const base = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  return [0, 1, 2].map((offset) => {
    const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return {
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: `${MONTH_NAMES_ES[d.getMonth()]} ${y}`,
      year: y,
      month: m,
    };
  });
}

function parseStoredDate(iso: string | null | undefined): { day: 5 | 20; monthKey: string } | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return null;
  if (d !== 5 && d !== 20) return null;
  return { day: d as 5 | 20, monthKey: `${y}-${String(m).padStart(2, "0")}` };
}

export default function ModelsClientList({ quarter, year = 2026, onHeaderState }: ModelsClientListProps) {
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [notified, setNotified] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [presented, setPresented] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [advisorEmails, setAdvisorEmails] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [quarterData, accounts, contactInfo] = await Promise.all([
        getClientQuarterData(year, quarter),
        getBankAccounts(),
        getAdvisorContactInfo(),
      ]);
      setAdvisorEmails(contactInfo.emails);
      setCompanyName(contactInfo.companyName);

      setNotified(quarterData.notified);
      setSubmittedAt(quarterData.submitted_at);
      setPresented(quarterData.presented);
      setComment(quarterData.comment);
      setBankAccounts(accounts);

      const defaultAccount = accounts.find((a) => a.is_default);
      const upcoming = getUpcomingMonths();

      setEntries(
        quarterData.entries.map((e) => {
          const stored = parseStoredDate(e.client_response?.deferment_first_payment_date);
          return {
            ...e,
            status: e.client_response?.status ?? "pending",
            selectedBankAccountId:
              e.client_response?.bank_account_id ?? defaultAccount?.id ?? "",
            dirty: false,
            ibanError: false,
            defermentRequested: e.client_response?.deferment_requested ?? false,
            defermentInstallments: e.client_response?.deferment_num_installments ?? 1,
            defermentDay: stored?.day ?? 5,
            defermentMonthKey: stored?.monthKey ?? upcoming[0].key,
          };
        })
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

  useEffect(() => {
    onHeaderState?.({ advisorEmails, companyName, presented, submittedAt });
  }, [onHeaderState, advisorEmails, companyName, presented, submittedAt]);

  function tryAccept(index: number) {
    if (presented) return;
    const entry = entries[index];
    // For non-informative models, IBAN must be selected before accepting
    if (!entry.is_informative && !entry.selectedBankAccountId) {
      setEntries((prev) =>
        prev.map((e, i) => (i === index ? { ...e, ibanError: true } : e))
      );
      return;
    }
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, status: e.status === "accepted" ? "pending" : "accepted", dirty: true, ibanError: false }
          : e
      )
    );
  }

  function tryReject(index: number) {
    if (presented) return;
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, status: e.status === "rejected" ? "pending" : "rejected", dirty: true, ibanError: false }
          : e
      )
    );
  }

  function toggleDeferment(index: number, checked: boolean) {
    if (presented) return;
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index ? { ...e, defermentRequested: checked, dirty: true } : e
      )
    );
  }

  function changeDefermentInstallments(index: number, value: number) {
    if (presented) return;
    const clamped = Math.max(1, Math.min(12, value));
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index ? { ...e, defermentInstallments: clamped, dirty: true } : e
      )
    );
  }

  function changeDefermentDay(index: number, day: 5 | 20) {
    if (presented) return;
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, defermentDay: day, dirty: true } : e))
    );
  }

  function changeDefermentMonth(index: number, monthKey: string) {
    if (presented) return;
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, defermentMonthKey: monthKey, dirty: true } : e))
    );
  }

  function buildDefermentPayload(e: LocalEntry): {
    deferment_requested: boolean;
    deferment_num_installments: number | null;
    deferment_first_payment_date: string | null;
  } {
    const isRequestable =
      e.status === "accepted"
      && e.model_code === "303"
      && e.entry_type === "pagar"
      && e.deferment_allowed
      && e.defermentRequested;
    if (!isRequestable) {
      return { deferment_requested: false, deferment_num_installments: null, deferment_first_payment_date: null };
    }
    const [y, m] = e.defermentMonthKey.split("-");
    const date = `${y}-${m}-${String(e.defermentDay).padStart(2, "0")}`;
    return {
      deferment_requested: true,
      deferment_num_installments: e.defermentInstallments,
      deferment_first_payment_date: date,
    };
  }

  function changeBankAccount(index: number, bankAccountId: string) {
    if (presented) return;
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, selectedBankAccountId: bankAccountId, dirty: true, ibanError: false }
          : e
      )
    );
  }

  async function handleSave() {
    const toSave = entries
      .filter((e) => e.dirty && e.status !== "pending")
      .map((e) => ({
        tax_entry_id: e.id,
        bank_account_id: e.is_informative ? null : (e.status === "accepted" ? e.selectedBankAccountId : null),
        status: e.status,
        ...buildDefermentPayload(e),
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
    const allDecided = entries.every((e) => e.status === "accepted" || e.status === "rejected");
    if (!allDecided) {
      setMessage("Debes aceptar o rechazar todos los modelos antes de enviar");
      setTimeout(() => setMessage(""), 5000);
      return;
    }

    const acceptedNeedIban = entries.some(
      (e) => e.status === "accepted" && !e.is_informative && !e.selectedBankAccountId
    );
    if (acceptedNeedIban) {
      setMessage("Selecciona un IBAN para cada modelo aceptado");
      setTimeout(() => setMessage(""), 5000);
      return;
    }

    const toSave = entries
      .filter((e) => e.status !== "pending")
      .map((e) => ({
        tax_entry_id: e.id,
        bank_account_id: e.is_informative ? null : (e.status === "accepted" ? e.selectedBankAccountId : null),
        status: e.status,
        ...buildDefermentPayload(e),
      }));

    setSubmitting(true);
    setMessage("");
    try {
      if (toSave.length > 0) {
        await saveClientResponses(toSave);
      }
      await submitQuarter(year, quarter);
      setSubmittedAt(new Date().toISOString());
      setEntries((prev) => prev.map((e) => ({ ...e, dirty: false })));
      setMessage("Enviado correctamente al asesor fiscal");
      setTimeout(() => setMessage(""), 5000);
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
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-gray-100 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-16 bg-gray-200 rounded" />
                <div className="h-3 w-32 bg-gray-100 rounded" />
                <div className="h-6 w-24 bg-gray-200 rounded" />
              </div>
              <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0" />
            </div>
          </div>
        ))}
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
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-text-body mb-1">No hay modelos disponibles para este trimestre</p>
        <p className="text-xs text-text-muted">Los modelos aparecerán aquí cuando el asesor los complete</p>
      </div>
    );
  }

  const hasDirty = entries.some((e) => e.dirty);
  const allDecided = entries.every((e) => e.status === "accepted" || e.status === "rejected");
  const canSubmit = allDecided && !entries.some((e) => e.status === "accepted" && !e.is_informative && !e.selectedBankAccountId);

  const upcomingMonths = getUpcomingMonths();

  const acceptedCount = entries.filter((e) => e.status === "accepted").length;
  const rejectedCount = entries.filter((e) => e.status === "rejected").length;
  const pendingCount = entries.filter((e) => e.status === "pending").length;

  return (
    <div>
      {comment.trim() && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-brand-teal/5 border border-brand-teal/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-brand-teal shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-brand-navy mb-1">Observaciones de tu asesor</p>
              <p className="text-sm text-text-body whitespace-pre-wrap break-words">{comment}</p>
            </div>
          </div>
        </div>
      )}

      {/* Status summary */}
      {(acceptedCount > 0 || rejectedCount > 0) && (
        <div className="mb-4 flex gap-3 text-xs">
          {acceptedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {acceptedCount} aceptado{acceptedCount !== 1 ? "s" : ""}
            </span>
          )}
          {rejectedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {rejectedCount} rechazado{rejectedCount !== 1 ? "s" : ""}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
              </svg>
              {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      <div className="space-y-4">
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            className={`border rounded-xl p-4 transition-colors animate-fade-in-up ${
              entry.status === "accepted"
                ? "border-green-200 bg-green-50/50"
                : entry.status === "rejected"
                  ? "border-red-200 bg-red-50/50"
                  : "border-gray-200"
            }`}
            style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-body">{entry.model_code}</span>
                  {entry.is_informative ? (
                    <span className="text-sm font-medium px-2 py-0.5 rounded-full bg-gray-100 text-text-muted">Informativo</span>
                  ) : (
                    <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${entry.entry_type === "pagar" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
                      {entry.entry_type === "pagar" ? "A pagar" : "A compensar"}
                    </span>
                  )}
                </div>
                {entry.description && <p className="text-xs text-text-muted mt-1">{entry.description}</p>}
                {(entry.amount !== 0 || !entry.is_informative) && (
                  <p className="text-lg font-semibold font-mono text-brand-navy mt-2">{formatAmount(entry.amount)}</p>
                )}
              </div>

              {/* Reject (left) | Accept (right) — disabled when presented */}
              {!presented && (
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => tryReject(index)}
                    className={`h-10 px-4 rounded-full text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer hover:opacity-80 ${
                      entry.status === "rejected"
                        ? "bg-red-500 text-white"
                        : "bg-gray-100 text-text-muted hover:bg-red-100 hover:text-red-600"
                    }`}
                  >
                    No Validar
                  </button>
                  <button
                    onClick={() => tryAccept(index)}
                    className={`h-10 px-4 rounded-full text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer hover:opacity-80 ${
                      entry.status === "accepted"
                        ? "bg-green-500 text-white"
                        : "bg-gray-100 text-text-muted hover:bg-green-100 hover:text-green-600"
                    }`}
                  >
                    Validar
                  </button>
                </div>
              )}
            </div>

            {/* Aplazamiento — solo 303 a pagar, con el asesor que lo haya habilitado y estado aceptado */}
            {entry.model_code === "303"
              && entry.entry_type === "pagar"
              && entry.deferment_allowed
              && entry.status === "accepted" && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {presented ? (
                    entry.defermentRequested ? (
                      <p className="text-xs text-brand-teal font-medium">
                        Aplazamiento solicitado — {entry.defermentInstallments} plazo{entry.defermentInstallments !== 1 ? "s" : ""} desde el {entry.defermentDay}/{entry.defermentMonthKey.split("-")[1]}/{entry.defermentMonthKey.split("-")[0]}
                      </p>
                    ) : (
                      <p className="text-xs text-text-muted">Sin aplazamiento</p>
                    )
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={entry.defermentRequested}
                          onChange={(e) => toggleDeferment(index, e.target.checked)}
                          className="accent-brand-teal"
                        />
                        <span className="text-sm text-text-body">Solicitar aplazamiento</span>
                      </label>

                      {entry.defermentRequested && (
                        <div className="mt-3 flex flex-wrap gap-4">
                          {/* Stepper de plazos */}
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-text-muted">Nº de plazos</label>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => changeDefermentInstallments(index, entry.defermentInstallments - 1)}
                                disabled={entry.defermentInstallments <= 1}
                                className="w-8 h-8 rounded-lg border border-gray-200 text-text-body hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                aria-label="Reducir plazos"
                              >
                                −
                              </button>
                              <span className="w-8 text-center text-sm font-medium text-text-body font-mono">
                                {entry.defermentInstallments}
                              </span>
                              <button
                                type="button"
                                onClick={() => changeDefermentInstallments(index, entry.defermentInstallments + 1)}
                                disabled={entry.defermentInstallments >= 12}
                                className="w-8 h-8 rounded-lg border border-gray-200 text-text-body hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                aria-label="Aumentar plazos"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Día del mes */}
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-text-muted">Día del primer pago</label>
                            <div className="flex gap-1">
                              {([5, 20] as const).map((day) => (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => changeDefermentDay(index, day)}
                                  className={`h-8 px-3 rounded-lg border text-sm font-medium transition-colors ${
                                    entry.defermentDay === day
                                      ? "border-brand-teal bg-brand-teal text-white"
                                      : "border-gray-200 text-text-body hover:bg-gray-50"
                                  }`}
                                >
                                  Día {day}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Mes */}
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-text-muted">Mes del primer pago</label>
                            <select
                              value={entry.defermentMonthKey}
                              onChange={(e) => changeDefermentMonth(index, e.target.value)}
                              className="h-8 px-3 rounded-lg border border-gray-200 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal transition-colors"
                            >
                              {upcomingMonths.map((m) => (
                                <option key={m.key} value={m.key}>{m.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

            {/* IBAN selector — always visible for non-informative models */}
            {!entry.is_informative && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Cuenta de destino
                  {entry.ibanError && (
                    <span className="ml-2 text-red-600 font-normal">— Selecciona una cuenta antes de aceptar</span>
                  )}
                </label>
                {presented ? (
                  <p className="text-sm text-text-body font-mono">
                    {bankAccounts.find((a) => a.id === entry.selectedBankAccountId)?.iban ?? "—"}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={entry.selectedBankAccountId}
                      onChange={(e) => changeBankAccount(index, e.target.value)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal transition-colors ${
                        entry.ibanError ? "border-red-400 bg-red-50" : "border-gray-200"
                      }`}
                    >
                      <option value="">Seleccionar cuenta...</option>
                      {bankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.iban}{account.label ? ` — ${account.label}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowAddAccount(true)}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-text-muted hover:bg-gray-50 transition-colors"
                      title="Añadir cuenta"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions — hidden when presented */}
      {!presented && (
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
              disabled={!canSubmit || submitting}
              className="px-6 py-2.5 bg-brand-teal text-white rounded-lg text-sm font-medium hover:bg-brand-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Enviando..." : "Enviar al asesor"}
            </button>
          </div>
          {message && (
            <span className={`text-sm ${message.includes("Error") || message.includes("Debes") || message.includes("Selecciona") ? "text-red-500" : "text-green-600"}`}>
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

