"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CompanyInfo } from "@/app/app/empresa/actions";
import {
  getCompanyInfo,
  updateCompanyContact,
  addCompanyBankAccount,
  updateCompanyBankAccount,
  deleteCompanyBankAccount,
} from "@/app/app/empresa/actions";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";

function formatIBAN(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

// ---------- Bank Account Form ----------
function BankAccountForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CompanyBankAccount;
  onSave: (iban: string, label: string | null, bankName: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [iban, setIban] = useState(initial ? formatIBAN(initial.iban) : "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [bankName, setBankName] = useState(initial?.bank_name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanIban = iban.replace(/\s/g, "");
    if (cleanIban.length < 15) {
      setError("IBAN demasiado corto");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(cleanIban, label || null, bankName || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-gray-50 rounded-lg p-3">
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">IBAN *</label>
        <input
          type="text"
          value={iban}
          onChange={(e) => setIban(e.target.value.toUpperCase())}
          placeholder="ES12 3456 7890 1234 5678 9012"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Etiqueta</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ej: Principal"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Banco</label>
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Ej: CaixaBank"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-text-muted hover:text-text-body px-3 py-1.5 rounded-lg cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="text-xs bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}

// ---------- Main Component ----------
interface CompanyInfoButtonProps {
  /** Si se provee, el botón flotante se oculta y el panel se controla externamente */
  externalOpen?: boolean;
  onExternalClose?: () => void;
}

export default function CompanyInfoButton({ externalOpen, onExternalClose }: CompanyInfoButtonProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (externalOpen !== undefined) {
      if (!v) onExternalClose?.();
    } else {
      setInternalOpen(v);
    }
  };
  const [info, setInfo] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Editable fields
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const [contactSaved, setContactSaved] = useState(false);

  // Bank accounts
  const [addingBank, setAddingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCompanyInfo();
      setInfo(data);
      setPhone(data.phone ?? "");
      setAddress(data.address ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !info) loadInfo();
  }, [open, info, loadInfo]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleSaveContact() {
    setSavingContact(true);
    try {
      await updateCompanyContact(phone || null, address || null);
      setInfo((prev) => (prev ? { ...prev, phone: phone || null, address: address || null } : prev));
      setEditingContact(false);
      setContactSaved(true);
      setTimeout(() => setContactSaved(false), 2000);
    } catch {
      // keep editing mode
    } finally {
      setSavingContact(false);
    }
  }

  async function handleAddBank(iban: string, label: string | null, bankName: string | null) {
    const newAccount = await addCompanyBankAccount(iban, label, bankName);
    setInfo((prev) =>
      prev ? { ...prev, bank_accounts: [...prev.bank_accounts, newAccount] } : prev
    );
    setAddingBank(false);
  }

  async function handleUpdateBank(
    accountId: string,
    iban: string,
    label: string | null,
    bankName: string | null
  ) {
    await updateCompanyBankAccount(accountId, iban, label, bankName);
    setInfo((prev) =>
      prev
        ? {
            ...prev,
            bank_accounts: prev.bank_accounts.map((ba) =>
              ba.id === accountId
                ? { ...ba, iban: iban.replace(/\s/g, "").toUpperCase(), label, bank_name: bankName }
                : ba
            ),
          }
        : prev
    );
    setEditingBankId(null);
  }

  async function handleDeleteBank(accountId: string) {
    setDeletingBankId(accountId);
    try {
      await deleteCompanyBankAccount(accountId);
      setInfo((prev) =>
        prev
          ? { ...prev, bank_accounts: prev.bank_accounts.filter((ba) => ba.id !== accountId) }
          : prev
      );
    } finally {
      setDeletingBankId(null);
    }
  }

  return (
    <>
      {/* Floating button con tooltip — se oculta cuando el panel se controla externamente */}
      {externalOpen === undefined && (
        <div className="fixed bottom-18 right-4 z-50 group/btn">
          <button
            onClick={() => setInternalOpen(true)}
            className="w-10 h-10 rounded-full bg-white/90 backdrop-blur border border-gray-200 shadow-lg hover:shadow-xl hover:bg-white transition-all flex items-center justify-center cursor-pointer"
            aria-label="Mi empresa"
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
              />
            </svg>
          </button>
          <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-gray-900 text-white text-xs whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 delay-300 pointer-events-none">
            Mi empresa
          </span>
        </div>
      )}

      {/* Backdrop + Panel */}
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div
            ref={panelRef}
            className="relative w-full max-w-md bg-white shadow-2xl h-full overflow-y-auto animate-slide-in-right"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold font-heading text-brand-navy">
                Información de empresa
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {loading && (
                <div className="space-y-6 animate-pulse">
                  {[
                    { titleW: "w-32", rows: 3, rowH: "h-[60px]" },
                    { titleW: "w-28", rows: 2, rowH: "h-[60px]" },
                    { titleW: "w-20", rows: 2, rowH: "h-[60px]" },
                    { titleW: "w-24", rows: 1, rowH: "h-[60px]" },
                  ].map((section, i) => (
                    <div key={i}>
                      <div className={`h-3 ${section.titleW} bg-gray-200 rounded mb-3`} />
                      <div className="space-y-2">
                        {Array.from({ length: section.rows }).map((_, j) => (
                          <div key={j} className={`${section.rowH} bg-gray-100 rounded-lg`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="text-sm text-red-500 bg-red-50 rounded-lg p-3">{error}</div>
              )}

              {info && !loading && (
                <>
                  {/* ---- Datos de la empresa (read-only) ---- */}
                  <section>
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                      Datos de la empresa
                    </h3>
                    <div className="space-y-2">
                      <div className="bg-gray-50 rounded-lg px-4 py-3">
                        <p className="text-xs text-text-muted">Nombre legal</p>
                        <p className="text-sm font-medium text-text-body">
                          {info.legal_name}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg px-4 py-3">
                        <p className="text-xs text-text-muted">Nombre comercial</p>
                        <p className="text-sm font-medium text-text-body">
                          {info.company_name ?? "—"}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg px-4 py-3">
                        <p className="text-xs text-text-muted">NIF / CIF</p>
                        <p className="text-sm font-medium font-mono text-text-body">
                          {info.nif ?? "—"}
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* ---- Cuentas asociadas (read-only) ---- */}
                  <section>
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                      Cuentas asociadas
                    </h3>
                    {info.accounts.length === 0 ? (
                      <p className="text-sm text-text-muted">Sin cuentas asociadas</p>
                    ) : (
                      <div className="space-y-2">
                        {info.accounts.map((acc) => (
                          <div key={acc.id} className="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-text-body truncate">
                                {acc.full_name ?? "Sin nombre"}
                              </p>
                              <p className="text-xs text-text-muted truncate">{acc.email}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* ---- Contacto (editable) ---- */}
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                        Contacto
                      </h3>
                      {!editingContact && (
                        <button
                          onClick={() => setEditingContact(true)}
                          className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer flex items-center gap-1"
                        >
                          {contactSaved ? (
                            <>
                              <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                              <span className="text-green-500">Guardado</span>
                            </>
                          ) : (
                            "Editar"
                          )}
                        </button>
                      )}
                    </div>

                    {editingContact ? (
                      <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                        <div>
                          <label className="block text-xs font-medium text-text-muted mb-1">
                            Teléfono
                          </label>
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="Ej: +34 912 345 678"
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-text-muted mb-1">
                            Dirección
                          </label>
                          <textarea
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="Ej: Calle Gran Vía 1, Madrid"
                            rows={2}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal resize-none"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setPhone(info.phone ?? "");
                              setAddress(info.address ?? "");
                              setEditingContact(false);
                            }}
                            className="text-xs text-text-muted hover:text-text-body px-3 py-1.5 rounded-lg cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleSaveContact}
                            disabled={savingContact}
                            className="text-xs bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer"
                          >
                            {savingContact ? "Guardando..." : "Guardar"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="bg-gray-50 rounded-lg px-4 py-3">
                          <p className="text-xs text-text-muted">Teléfono</p>
                          <p className="text-sm font-medium font-mono text-text-body">
                            {info.phone ?? "—"}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg px-4 py-3">
                          <p className="text-xs text-text-muted">Dirección</p>
                          <p className="text-sm font-medium text-text-body">
                            {info.address ?? "—"}
                          </p>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* ---- Cuentas bancarias (CRUD) ---- */}
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                        Cuentas bancarias
                      </h3>
                      {!addingBank && (
                        <button
                          onClick={() => setAddingBank(true)}
                          className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          Añadir
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {info.bank_accounts.length === 0 && !addingBank && (
                        <p className="text-sm text-text-muted bg-gray-50 rounded-lg px-4 py-3">
                          Sin cuentas bancarias
                        </p>
                      )}

                      {info.bank_accounts.map((ba) =>
                        editingBankId === ba.id ? (
                          <BankAccountForm
                            key={ba.id}
                            initial={ba}
                            onSave={(iban, label, bankName) =>
                              handleUpdateBank(ba.id, iban, label, bankName)
                            }
                            onCancel={() => setEditingBankId(null)}
                          />
                        ) : (
                          <div
                            key={ba.id}
                            className="bg-gray-50 rounded-lg px-4 py-3 group"
                          >
                            <div className="flex items-start justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  {ba.label && (
                                    <span className="text-xs font-medium text-brand-teal">
                                      {ba.label}
                                    </span>
                                  )}
                                  {ba.is_default && (
                                    <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 rounded-full font-medium">
                                      Principal
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-mono text-text-body">
                                  {formatIBAN(ba.iban)}
                                </p>
                                {ba.bank_name && (
                                  <p className="text-xs text-text-muted mt-0.5">
                                    {ba.bank_name}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => setEditingBankId(ba.id)}
                                  className="p-1 rounded hover:bg-gray-200 transition-colors cursor-pointer"
                                  title="Editar"
                                >
                                  <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteBank(ba.id)}
                                  disabled={deletingBankId === ba.id}
                                  className="p-1 rounded hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                                  title="Eliminar"
                                >
                                  <svg className="w-3.5 h-3.5 text-red-400 hover:text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      )}

                      {addingBank && (
                        <BankAccountForm
                          onSave={handleAddBank}
                          onCancel={() => setAddingBank(false)}
                        />
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
