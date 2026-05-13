"use client";

import { useEffect, useState, useCallback } from "react";
import type {
  CompanyInfo,
  ContractedServiceForClient,
} from "@/app/app/empresa/actions";
import {
  getCompanyInfo,
  addCompanyBankAccount,
  updateCompanyBankAccount,
  deleteCompanyBankAccount,
  getCompanyContractedServices,
} from "@/app/app/empresa/actions";
import {
  addClientComment,
  getApartadoFileSignedUrlForClient,
  getApartadoTemplateSignedUrlForClient,
  getMyDocumentation,
  softDeleteApartadoFile,
  submitFormApartado,
  uploadApartadoFile,
} from "@/app/app/empresa/documentation-actions";
import type { ClientDocumentation } from "@/lib/types/documentation";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";
import DocumentationMasterDetail from "@/components/documentation/documentation-master-detail";

type TabKey = "documentacion" | "servicios" | "datos";

const TABS: { key: TabKey; label: string }[] = [
  { key: "documentacion", label: "Documentación" },
  { key: "servicios", label: "Servicios contratados" },
  { key: "datos", label: "Datos" },
];

function formatIBAN(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
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
          <label className="block text-xs font-medium text-text-muted mb-1">
            Etiqueta <span className="font-normal text-text-muted/70">(opcional)</span>
          </label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej: Principal"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            Banco <span className="font-normal text-text-muted/70">(opcional)</span>
          </label>
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
export default function EmpresaPage({ currentUserId }: { currentUserId: string }) {
  const [info, setInfo] = useState<CompanyInfo | null>(null);
  const [doc, setDoc] = useState<ClientDocumentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("documentacion");

  const [addingBank, setAddingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);

  // Servicios contratados — cargados on-demand al abrir el tab.
  const [services, setServices] = useState<ContractedServiceForClient[] | null>(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  useEffect(() => {
    if (tab !== "servicios" || services !== null) return;
    let cancelled = false;
    setServicesLoading(true);
    getCompanyContractedServices()
      .then((rows) => {
        if (!cancelled) setServices(rows);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, services]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [companyInfo, documentation] = await Promise.all([
        getCompanyInfo(),
        getMyDocumentation(),
      ]);
      setInfo(companyInfo);
      setDoc(documentation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function refreshDocumentation() {
    try {
      const updated = await getMyDocumentation();
      setDoc(updated);
    } catch {
      // silencioso
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
    <div className="min-h-full px-8 py-8">
      <div className="max-w-screen-2xl">
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-9 bg-gray-300 rounded w-72" />
            <div className="h-4 bg-gray-200 rounded w-48" />
            <div className="flex gap-2 mt-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-7 bg-gray-200 rounded w-24" />
              ))}
            </div>
            <div className="h-64 bg-white rounded-2xl border border-gray-100" />
          </div>
        )}

        {error && <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4">{error}</div>}

        {info && doc && !loading && (
          <div>
            {/* Sticky header + tabs */}
            <div className="sticky top-0 z-20 bg-surface-gray pt-1 -mt-1">
              <p className="text-brand-teal text-sm font-medium mb-2">Portal de clientes</p>
              {/* Header */}
              <div>
                <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
                  {info.company_name || info.legal_name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-muted">
                  {info.company_name && info.company_name !== info.legal_name && (
                    <span>{info.legal_name}</span>
                  )}
                  {info.nif && <span className="font-mono">{info.nif}</span>}
                </div>
              </div>

              {/* Tabs */}
              <div className="mt-4 border-b border-gray-200 flex items-center gap-4 flex-wrap">
                {TABS.map((t) => {
                  const active = t.key === tab;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`text-sm font-medium pb-2 -mb-px border-b-2 transition-colors cursor-pointer ${
                        active
                          ? "border-brand-teal text-brand-navy"
                          : "border-transparent text-text-muted hover:text-text-body"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 space-y-5">
            {/* Tab content */}
            {tab === "documentacion" && (
              <DocumentationMasterDetail
                data={doc}
                mode="client"
                currentUserId={currentUserId}
                handlers={{
                  uploadFile: async (clientApartadoId, file) => {
                    const base64 = await fileToBase64(file);
                    await uploadApartadoFile({
                      clientApartadoId,
                      fileName: file.name,
                      fileBase64: base64,
                      mimeType: file.type || "application/octet-stream",
                    });
                    await refreshDocumentation();
                  },
                  downloadFile: (id) => getApartadoFileSignedUrlForClient(id),
                  downloadTemplate: (id) => getApartadoTemplateSignedUrlForClient(id),
                  deleteFile: async (id) => {
                    await softDeleteApartadoFile(id);
                    await refreshDocumentation();
                  },
                  addComment: async (clientApartadoId, body) => {
                    await addClientComment(clientApartadoId, body);
                    await refreshDocumentation();
                  },
                  submitForm: async (clientApartadoId, slug, payload) => {
                    await submitFormApartado({ clientApartadoId, slug, payload });
                    await refreshDocumentation();
                  },
                }}
              />
            )}

            {tab === "servicios" && (
              <div className="space-y-3">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Servicios contratados
                    </p>
                    {services && (
                      <span className="text-xs text-text-muted">
                        {services.length}{" "}
                        {services.length === 1 ? "servicio" : "servicios"}
                      </span>
                    )}
                  </div>
                  {servicesLoading && services === null && (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-16 bg-gray-100 rounded-lg" />
                      <div className="h-16 bg-gray-100 rounded-lg" />
                    </div>
                  )}
                  {services && services.length === 0 && (
                    <p className="text-sm text-text-muted">
                      Aún no tienes servicios contratados. Habla con tu equipo de
                      Lean Finance.
                    </p>
                  )}
                  {services && services.length > 0 && (
                    <ul className="space-y-2">
                      {services.map((s) => (
                        <li
                          key={s.service_id}
                          className="bg-gray-50 rounded-lg px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-brand-navy">
                                {s.service_name}
                              </p>
                              {s.department_names.length > 0 && (
                                <p className="text-[11px] text-text-muted mt-0.5">
                                  {s.department_names.join(" · ")}
                                </p>
                              )}
                            </div>
                          </div>
                          {s.service_description && (
                            <p className="text-xs text-text-muted mt-2">
                              {s.service_description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {tab === "datos" && (
              <div className="space-y-3">
                {/* Datos informativos */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Datos informativos
                  </p>
                  <Field label="Nombre legal" value={info.legal_name} />
                  <Field label="Nombre comercial" value={info.company_name ?? "—"} />
                  <Field label="NIF / CIF" value={info.nif ?? "—"} mono />
                  <p className="text-xs text-text-muted pt-3 border-t border-gray-100">
                    Si necesitas modificar alguno de estos datos, contacta con el soporte.
                  </p>
                </div>

                {/* Cuentas asociadas */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Cuentas asociadas
                    </p>
                    <span className="text-xs text-text-muted">
                      {info.accounts.length} {info.accounts.length === 1 ? "cuenta" : "cuentas"}
                    </span>
                  </div>
                  {info.accounts.length === 0 ? (
                    <p className="text-sm text-text-muted">Sin cuentas asociadas</p>
                  ) : (
                    <ul className="space-y-2">
                      {info.accounts.map((acc) => (
                        <li key={acc.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
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
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Cuentas bancarias */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Cuentas bancarias
                    </p>
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
                      <p className="text-sm text-text-muted">Sin cuentas bancarias</p>
                    )}
                    {info.bank_accounts.map((ba) =>
                      editingBankId === ba.id ? (
                        <BankAccountForm
                          key={ba.id}
                          initial={ba}
                          onSave={(iban, label, bankName) => handleUpdateBank(ba.id, iban, label, bankName)}
                          onCancel={() => setEditingBankId(null)}
                        />
                      ) : (
                        <div key={ba.id} className="bg-gray-50 rounded-lg px-3 py-2.5 group">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                {ba.label && <span className="text-xs font-medium text-brand-teal">{ba.label}</span>}
                                {ba.is_default && (
                                  <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 rounded-full font-medium">
                                    Principal
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-mono text-text-body">{formatIBAN(ba.iban)}</p>
                              {ba.bank_name && <p className="text-xs text-text-muted mt-0.5">{ba.bank_name}</p>}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button
                                onClick={() => setEditingBankId(ba.id)}
                                className="p-1 rounded hover:bg-white transition-colors cursor-pointer"
                                title="Editar"
                              >
                                <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteBank(ba.id)}
                                disabled={deletingBankId === ba.id}
                                className="p-1 rounded hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                                title="Eliminar"
                              >
                                <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    )}
                    {addingBank && <BankAccountForm onSave={handleAddBank} onCancel={() => setAddingBank(false)} />}
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-sm font-medium text-text-body mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
