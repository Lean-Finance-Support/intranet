"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClienteCompany, ClientAccount, CompanyDetailInfo } from "@/app/admin/clientes/actions";
import {
  getCompanyDetail,
  getCompanyResponsibleTeamAction,
  findClientProfileByEmail,
} from "@/app/admin/clientes/actions";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";
import type { ResponsibleTeam } from "@/lib/team-queries";
import ResponsibleTeamSection from "@/components/clients/responsible-team-section";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatIBAN(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

// ---- Bank Account Form ----
export function BankAccountForm({
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
    const clean = iban.replace(/\s/g, "");
    if (clean.length < 15) { setError("IBAN demasiado corto"); return; }
    setSaving(true); setError("");
    try { await onSave(clean, label || null, bankName || null); }
    catch (err) { setError(err instanceof Error ? err.message : "Error al guardar"); setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-gray-50 rounded-lg p-3">
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">IBAN *</label>
        <input type="text" value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())}
          placeholder="ES12 3456 7890 1234 5678 9012"
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

// ---- Edit Client Account Form ----
export function EditClientAccountForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ClientAccount;
  onSave: (input: { email: string; full_name: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState(initial.email);
  const [fullName, setFullName] = useState(initial.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("El email es obligatorio"); return; }
    setSaving(true); setError("");
    try { await onSave({ email: email.trim(), full_name: fullName.trim() || null }); }
    catch (err) { setError(err instanceof Error ? err.message : "Error al guardar"); setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-gray-50 rounded-lg p-3">
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Email *</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="cliente@empresa.com"
          required
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Nombre</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nombre y apellidos"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
        />
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

// ---- Add Client Account Form (con detección automática de email existente) ----
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddClientAccountForm({
  existingProfileIds,
  onSubmit,
  onCancel,
}: {
  existingProfileIds: string[];
  onSubmit: (input: { email: string; full_name: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<ClientAccount | null>(null);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Búsqueda con debounce al teclear el email
  useEffect(() => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setFound(null);
      setSearched(false);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const result = await findClientProfileByEmail(clean);
        if (!cancelled) {
          setFound(result);
          setSearched(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
      setSearching(false);
    };
  }, [email]);

  const alreadyLinked = !!found && existingProfileIds.includes(found.id);
  const canSubmit = !saving && EMAIL_RE.test(email.trim()) && !alreadyLinked && (found !== null || fullName.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true); setError("");
    try {
      await onSubmit({
        email: email.trim().toLowerCase(),
        full_name: found ? found.full_name : (fullName.trim() || null),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-gray-50 rounded-lg p-3">
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Email *</label>
        <div className="relative">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@empresa.com"
            required
            autoFocus
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
          {searching && (
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
            </svg>
          )}
        </div>
      </div>

      {/* Resultado de la búsqueda */}
      {searched && found && alreadyLinked && (
        <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span>Esta cuenta ya está vinculada a esta empresa.</span>
        </div>
      )}

      {searched && found && !alreadyLinked && (
        <div className="flex items-center gap-3 bg-brand-teal/5 border border-brand-teal/30 rounded-lg px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-text-muted">Cliente existente — se vinculará a esta empresa</p>
            <p className="text-sm font-medium text-text-body truncate">{found.full_name ?? "Sin nombre"}</p>
          </div>
        </div>
      )}

      {searched && !found && (
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nombre y apellidos"
            required
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
          <p className="text-[11px] text-text-muted mt-1">No existe ningún cliente con este email — se creará una cuenta nueva.</p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs text-text-muted hover:text-text-body px-3 py-1.5 rounded-lg cursor-pointer">Cancelar</button>
        <button type="submit" disabled={!canSubmit} className="text-xs bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer">
          {saving ? "Guardando..." : found ? "Vincular" : "Crear cuenta"}
        </button>
      </div>
    </form>
  );
}

// ---- Main Panel ----
interface ClientDetailPanelProps {
  company: ClienteCompany;
  linkPrefix: string;
  canViewDashboard: boolean;
  canViewTaxModels: boolean;
  onClose: () => void;
}

export default function ClientDetailPanel({
  company,
  linkPrefix,
  canViewDashboard,
  canViewTaxModels,
  onClose,
}: ClientDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Detail data (lazy-loaded)
  const [detail, setDetail] = useState<CompanyDetailInfo | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [team, setTeam] = useState<ResponsibleTeam | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const isDeleted = detail?.deleted_at != null;

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const d = await getCompanyDetail(company.id);
      setDetail(d);
    } finally {
      setLoadingDetail(false);
    }
  }, [company.id]);

  const loadTeam = useCallback(async () => {
    setLoadingTeam(true);
    try {
      const t = await getCompanyResponsibleTeamAction(company.id);
      setTeam(t);
    } finally {
      setLoadingTeam(false);
    }
  }, [company.id]);

  useEffect(() => {
    loadDetail();
    loadTeam();
  }, [loadDetail, loadTeam]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        ref={panelRef}
        className="relative w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto animate-slide-in-right"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-start gap-3 z-10">
          {/* Expand button — top-left: abrir ficha completa */}
          <a
            href={`${linkPrefix}/clientes/${company.id}`}
            title="Abrir ficha completa"
            aria-label="Abrir ficha completa"
            className="flex-shrink-0 mt-1 w-7 h-7 rounded-md bg-brand-teal hover:bg-brand-teal/90 active:bg-brand-teal/80 text-white flex items-center justify-center shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H4v5" />
              <path d="M4 3l6 6" />
              <path d="M15 21h5v-5" />
              <path d="M20 21l-6-6" />
            </svg>
          </a>
          <div className="flex-1 min-w-0">
            {isDeleted ? (
              <div className="text-left">
                <h2 className="text-lg font-bold font-heading text-text-muted truncate line-through decoration-gray-300">
                  {company.company_name || company.legal_name}
                </h2>
                {company.company_name && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">{company.legal_name}</p>
                )}
              </div>
            ) : (
              <div className="text-left">
                <h2 className="text-lg font-bold font-heading text-brand-navy truncate">
                  {company.company_name || company.legal_name}
                </h2>
                {company.company_name && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">{company.legal_name}</p>
                )}
              </div>
            )}
            {company.nif && <p className="text-xs text-text-muted font-mono mt-1">{company.nif}</p>}
            <p className="text-xs text-text-muted mt-1">
              Alta en la plataforma: <span className="text-text-body">{formatDate(company.created_at)}</span>
            </p>
            {isDeleted && detail?.deleted_at && (
              <span className="inline-flex items-center gap-1 mt-2 text-[10px] bg-gray-200 text-text-muted px-2 py-0.5 rounded-full font-medium">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M5.272 5.79c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Eliminada el {formatDate(detail.deleted_at)}
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar"
            className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ---- Equipo responsable ---- */}
          <ResponsibleTeamSection team={team} loading={loadingTeam} variant="panel" />

          {/* ---- Services (read-only en el drawer; gestión en /clientes/[id]) ---- */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Servicios contratados
            </h3>
            {company.services.length === 0 ? (
              <p className="text-sm text-text-muted italic">Sin servicios contratados</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {company.services.map((svc) => {
                  const dashboardHref =
                    svc.service_slug === "dashboard" && canViewDashboard
                      ? `${linkPrefix}/clientes/${company.id}/dashboard`
                      : null;
                  const taxModelsHref =
                    svc.service_slug === "tax-models" && canViewTaxModels
                      ? `${linkPrefix}/modelos?company=${company.id}`
                      : null;
                  const href = dashboardHref ?? taxModelsHref;
                  return (
                    <span
                      key={svc.service_id}
                      className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-100 rounded-full pl-3 pr-2 py-1"
                    >
                      <span className="font-medium text-text-body">{svc.service_name}</span>
                      <span className="text-[10px] text-text-muted">·</span>
                      <span className="text-[10px] text-text-muted">{svc.department_name}</span>
                      {href && (
                        <a
                          href={href}
                          title={`Ir a ${svc.service_name}`}
                          className="ml-0.5 text-brand-teal hover:text-brand-teal/70 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- Profiles (lazy, solo lectura) ---- */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Cuentas asociadas</h3>

            {loadingDetail ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-12 bg-gray-100 rounded-lg" />
              </div>
            ) : (
              <div className="space-y-2">
                {(detail?.profiles ?? []).length === 0 && (
                  <p className="text-sm text-text-muted">Sin cuentas asociadas</p>
                )}
                {(detail?.profiles ?? []).map((acc) => (
                  <div key={acc.id} className="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-body truncate">{acc.full_name ?? "Sin nombre"}</p>
                      <p className="text-xs text-text-muted truncate">{acc.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
