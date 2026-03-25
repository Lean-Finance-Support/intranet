"use client";

import { useEffect, useState, useCallback } from "react";
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
    if (cleanIban.length < 15) { setError("IBAN demasiado corto"); return; }
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
    <form onSubmit={handleSubmit} className="space-y-3 bg-gray-50 rounded-xl p-4">
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">IBAN *</label>
        <input type="text" value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="ES12 3456 7890 1234 5678 9012"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Etiqueta</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej: Principal"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Banco</label>
          <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Ej: CaixaBank"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal" />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs text-text-muted hover:text-text-body px-3 py-1.5 rounded-lg cursor-pointer">Cancelar</button>
        <button type="submit" disabled={saving} className="text-xs bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer">
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}

// ---------- Main Component ----------
export default function EmpresaPage() {
  const [info, setInfo] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);

  const [addingBank, setAddingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);

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

  useEffect(() => { loadInfo(); }, [loadInfo]);

  async function handleSaveContact() {
    setSavingContact(true);
    try {
      await updateCompanyContact(phone || null, address || null);
      setInfo((prev) => prev ? { ...prev, phone: phone || null, address: address || null } : prev);
      setEditingContact(false);
      setContactSaved(true);
      setTimeout(() => setContactSaved(false), 2000);
    } finally {
      setSavingContact(false);
    }
  }

  async function handleAddBank(iban: string, label: string | null, bankName: string | null) {
    const newAccount = await addCompanyBankAccount(iban, label, bankName);
    setInfo((prev) => prev ? { ...prev, bank_accounts: [...prev.bank_accounts, newAccount] } : prev);
    setAddingBank(false);
  }

  async function handleUpdateBank(accountId: string, iban: string, label: string | null, bankName: string | null) {
    await updateCompanyBankAccount(accountId, iban, label, bankName);
    setInfo((prev) => prev ? {
      ...prev,
      bank_accounts: prev.bank_accounts.map((ba) =>
        ba.id === accountId ? { ...ba, iban: iban.replace(/\s/g, "").toUpperCase(), label, bank_name: bankName } : ba
      ),
    } : prev);
    setEditingBankId(null);
  }

  async function handleDeleteBank(accountId: string) {
    setDeletingBankId(accountId);
    try {
      await deleteCompanyBankAccount(accountId);
      setInfo((prev) => prev ? { ...prev, bank_accounts: prev.bank_accounts.filter((ba) => ba.id !== accountId) } : prev);
    } finally {
      setDeletingBankId(null);
    }
  }

  return (
    <div className="min-h-full px-8 py-12">
      <div className="max-w-2xl">
        <p className="text-brand-teal text-sm font-medium mb-2">Portal de clientes</p>
        <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight mb-8">
          Mi empresa
        </h1>

        {loading && (
          <div className="space-y-6 animate-pulse">
            {[{ w: "w-32", rows: 3 }, { w: "w-28", rows: 2 }, { w: "w-20", rows: 2 }, { w: "w-24", rows: 1 }].map((s, i) => (
              <div key={i}>
                <div className={`h-3 ${s.w} bg-gray-300 rounded mb-3`} />
                <div className="space-y-2">
                  {Array.from({ length: s.rows }).map((_, j) => <div key={j} className="h-16 bg-gray-200 rounded-xl" />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4">{error}</div>}

        {info && !loading && (
          <div className="space-y-8">
            {/* Datos de la empresa */}
            <section>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Datos de la empresa</p>
              <div className="space-y-2">
                <InfoRow label="Nombre legal" value={info.legal_name} />
                <InfoRow label="Nombre comercial" value={info.company_name ?? "—"} />
                <InfoRow label="NIF / CIF" value={info.nif ?? "—"} mono />
              </div>
            </section>

            {/* Cuentas asociadas */}
            <section>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Cuentas asociadas</p>
              {info.accounts.length === 0 ? (
                <p className="text-sm text-text-muted">Sin cuentas asociadas</p>
              ) : (
                <div className="space-y-2">
                  {info.accounts.map((acc) => (
                    <div key={acc.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 border border-gray-100">
                      <div className="w-8 h-8 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-body truncate">{acc.full_name ?? "Sin nombre"}</p>
                        <p className="text-xs text-text-muted truncate">{acc.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Contacto */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Contacto</p>
                {!editingContact && (
                  <button onClick={() => setEditingContact(true)} className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer flex items-center gap-1">
                    {contactSaved ? (
                      <><svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg><span className="text-green-500">Guardado</span></>
                    ) : "Editar"}
                  </button>
                )}
              </div>
              {editingContact ? (
                <div className="space-y-3 bg-white rounded-xl p-4 border border-gray-100">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Teléfono</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+34 912 345 678"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Dirección</label>
                    <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle Gran Vía 1, Madrid" rows={2}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal resize-none" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setPhone(info.phone ?? ""); setAddress(info.address ?? ""); setEditingContact(false); }}
                      className="text-xs text-text-muted hover:text-text-body px-3 py-1.5 rounded-lg cursor-pointer">Cancelar</button>
                    <button onClick={handleSaveContact} disabled={savingContact}
                      className="text-xs bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer">
                      {savingContact ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <InfoRow label="Teléfono" value={info.phone ?? "—"} mono />
                  <InfoRow label="Dirección" value={info.address ?? "—"} />
                </div>
              )}
            </section>

            {/* Cuentas bancarias */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Cuentas bancarias</p>
                {!addingBank && (
                  <button onClick={() => setAddingBank(true)} className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium flex items-center gap-1 cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Añadir
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {info.bank_accounts.length === 0 && !addingBank && (
                  <p className="text-sm text-text-muted bg-white rounded-xl px-4 py-3 border border-gray-100">Sin cuentas bancarias</p>
                )}
                {info.bank_accounts.map((ba) =>
                  editingBankId === ba.id ? (
                    <BankAccountForm key={ba.id} initial={ba}
                      onSave={(iban, label, bankName) => handleUpdateBank(ba.id, iban, label, bankName)}
                      onCancel={() => setEditingBankId(null)} />
                  ) : (
                    <div key={ba.id} className="bg-white rounded-xl px-4 py-3 border border-gray-100 group">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            {ba.label && <span className="text-xs font-medium text-brand-teal">{ba.label}</span>}
                            {ba.is_default && <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 rounded-full font-medium">Principal</span>}
                          </div>
                          <p className="text-sm font-mono text-text-body">{formatIBAN(ba.iban)}</p>
                          {ba.bank_name && <p className="text-xs text-text-muted mt-0.5">{ba.bank_name}</p>}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingBankId(ba.id)} className="p-1 rounded hover:bg-gray-100 transition-colors cursor-pointer" title="Editar">
                            <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                          </button>
                          <button onClick={() => handleDeleteBank(ba.id)} disabled={deletingBankId === ba.id} className="p-1 rounded hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50" title="Eliminar">
                            <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
                {addingBank && <BankAccountForm onSave={handleAddBank} onCancel={() => setAddingBank(false)} />}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white rounded-xl px-4 py-3 border border-gray-100">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-sm font-medium text-text-body mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
