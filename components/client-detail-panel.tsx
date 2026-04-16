"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClienteCompany, ClienteService, ClientAccount, DeptMemberSlim, CompanyDetailInfo } from "@/app/admin/clientes/actions";
import {
  getCompanyDetail,
  updateCompanyNameAdmin,
  addCompanyBankAccountAdmin,
  updateCompanyBankAccountAdmin,
  deleteCompanyBankAccountAdmin,
  addServiceToCompany,
  removeServiceFromCompany,
  assignTechnicianAdmin,
  removeTechnicianAdmin,
  assignAllTechniciansAdmin,
  createClientAccount,
  updateClientAccount,
  unlinkClientFromCompany,
  findClientProfileByEmail,
} from "@/app/admin/clientes/actions";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";
import ConfirmDialog from "@/components/confirm-dialog";

function formatIBAN(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

// ---- Service routes ----
const SERVICE_ROUTES: Record<string, string> = {
  "tax-models": "/modelos",
  "enisa-docs": "/enisa",
};

// ---- Bank Account Form ----
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

// ---- Service Section in detail panel ----
function ServiceDetailSection({
  service,
  isChiefOfDept,
  members,
  linkPrefix,
  companyId,
  onAssign,
  onRemove,
  onRemoveService,
  onAssignAll,
}: {
  service: ClienteService;
  isChiefOfDept: boolean;
  members: DeptMemberSlim[];
  linkPrefix: string;
  companyId: string;
  onAssign: (serviceId: string, techId: string) => void;
  onRemove: (serviceId: string, techId: string) => void;
  onRemoveService: (serviceId: string) => void;
  onAssignAll: (serviceId: string) => void;
}) {
  const existingIds = new Set(service.technicians.map((t) => t.id));
  const available = members.filter((m) => !existingIds.has(m.id));
  const serviceRoute = SERVICE_ROUTES[service.service_slug];

  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-body">{service.service_name}</span>
          <span className="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded-full">{service.department_name}</span>
        </div>
        <div className="flex items-center gap-1">
          {serviceRoute && (
            <a
              href={`${linkPrefix}${serviceRoute}?company=${companyId}`}
              className="p-1 rounded hover:bg-brand-teal/10 text-brand-teal transition-colors"
              title={`Ir a ${service.service_name}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}
          {isChiefOfDept && (
            <button onClick={() => onRemoveService(service.service_id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer" title="Quitar servicio">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Technicians */}
      <div>
        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Técnicos</p>
        {service.technicians.length === 0 ? (
          <p className="text-xs text-text-muted italic">Sin técnicos asignados</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {service.technicians.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
                <span className="text-text-body">{t.name ?? "Desconocido"}</span>
                {isChiefOfDept && (
                  <button onClick={() => onRemove(service.service_id, t.id)} className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer" title="Quitar">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {isChiefOfDept && available.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <select
              onChange={(e) => { if (e.target.value) { onAssign(service.service_id, e.target.value); e.target.value = ""; } }}
              defaultValue=""
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal bg-white cursor-pointer"
            >
              <option value="" disabled>+ Añadir técnico</option>
              {available.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.id}</option>)}
            </select>
            <button
              onClick={() => onAssignAll(service.service_id)}
              className="text-[11px] text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer"
            >
              Asignar todos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Edit Client Account Form ----
function EditClientAccountForm({
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AddClientAccountForm({
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
  userChiefDeptIds: string[];
  deptMembers: { [deptId: string]: DeptMemberSlim[] };
  chiefAvailableServices: { service_id: string; service_name: string; department_id: string }[];
  canManageClientAccounts: boolean;
  linkPrefix: string;
  onClose: () => void;
  onUpdateName: (companyId: string, name: string | null) => void;
  onServiceAdded: (companyId: string, service: ClienteService) => void;
  onServiceRemoved: (companyId: string, serviceId: string) => void;
  onTechAssigned: (companyId: string, serviceId: string, tech: { id: string; name: string | null }) => void;
  onTechRemoved: (companyId: string, serviceId: string, techId: string) => void;
}

export default function ClientDetailPanel({
  company,
  userChiefDeptIds,
  deptMembers,
  chiefAvailableServices,
  canManageClientAccounts,
  linkPrefix,
  onClose,
  onUpdateName,
  onServiceAdded,
  onServiceRemoved,
  onTechAssigned,
  onTechRemoved,
}: ClientDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Detail data (lazy-loaded)
  const [detail, setDetail] = useState<CompanyDetailInfo | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Editable name
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(company.company_name ?? "");
  const [savingName, setSavingName] = useState(false);

  // Bank accounts
  const [addingBank, setAddingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);

  // Add service
  const [addingService, setAddingService] = useState(false);
  const [savingService, setSavingService] = useState(false);

  // Client accounts
  const [addingAccount, setAddingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [unlinkConfirmAccount, setUnlinkConfirmAccount] = useState<ClientAccount | null>(null);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const d = await getCompanyDetail(company.id);
      setDetail(d);
    } finally {
      setLoadingDetail(false);
    }
  }, [company.id]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Keep name in sync if company prop updates
  useEffect(() => { setNameValue(company.company_name ?? ""); }, [company.company_name]);

  async function handleSaveName() {
    setSavingName(true);
    try {
      await updateCompanyNameAdmin(company.id, nameValue || null);
      onUpdateName(company.id, nameValue || null);
      setEditingName(false);
    } finally { setSavingName(false); }
  }

  async function handleAddBank(iban: string, label: string | null, bankName: string | null) {
    const newAccount = await addCompanyBankAccountAdmin(company.id, iban, label, bankName);
    setDetail((prev) => prev ? { ...prev, bank_accounts: [...prev.bank_accounts, newAccount] } : prev);
    setAddingBank(false);
  }

  async function handleUpdateBank(accountId: string, iban: string, label: string | null, bankName: string | null) {
    await updateCompanyBankAccountAdmin(company.id, accountId, iban, label, bankName);
    setDetail((prev) => prev ? {
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
      await deleteCompanyBankAccountAdmin(company.id, accountId);
      setDetail((prev) => prev ? { ...prev, bank_accounts: prev.bank_accounts.filter((ba) => ba.id !== accountId) } : prev);
    } finally { setDeletingBankId(null); }
  }

  async function handleAddService(serviceId: string) {
    const svcMeta = chiefAvailableServices.find((s) => s.service_id === serviceId);
    if (!svcMeta) return;
    setSavingService(true);
    try {
      await addServiceToCompany(company.id, serviceId);
      // Build minimal ClienteService for optimistic update
      const newSvc: ClienteService = {
        service_id: svcMeta.service_id,
        service_name: svcMeta.service_name,
        service_slug: "",
        department_id: svcMeta.department_id,
        department_name: "",
        technicians: [],
      };
      onServiceAdded(company.id, newSvc);
      setAddingService(false);
    } finally { setSavingService(false); }
  }

  async function handleRemoveService(serviceId: string) {
    try {
      await removeServiceFromCompany(company.id, serviceId);
      onServiceRemoved(company.id, serviceId);
    } catch { /* keep state */ }
  }

  function handleAssignTech(serviceId: string, techId: string) {
    // Find tech name from deptMembers
    const svc = company.services.find((s) => s.service_id === serviceId);
    const members = deptMembers[svc?.department_id ?? ""] ?? [];
    const member = members.find((m) => m.id === techId);
    onTechAssigned(company.id, serviceId, { id: techId, name: member?.name ?? null });
    assignTechnicianAdmin(company.id, serviceId, techId).catch(() => {});
  }

  function handleRemoveTech(serviceId: string, techId: string) {
    onTechRemoved(company.id, serviceId, techId);
    removeTechnicianAdmin(company.id, serviceId, techId).catch(() => {});
  }

  async function handleAddAccount(input: { email: string; full_name: string | null }) {
    const created = await createClientAccount(company.id, input);
    setDetail((prev) => {
      if (!prev) return prev;
      const exists = prev.profiles.some((p) => p.id === created.id);
      return exists ? prev : { ...prev, profiles: [...prev.profiles, created] };
    });
    setAddingAccount(false);
  }

  async function handleUpdateAccount(profileId: string, input: { email: string; full_name: string | null }) {
    const updated = await updateClientAccount(profileId, input);
    setDetail((prev) =>
      prev ? { ...prev, profiles: prev.profiles.map((p) => (p.id === profileId ? updated : p)) } : prev
    );
    setEditingAccountId(null);
  }

  async function handleConfirmUnlink(profileId: string) {
    await unlinkClientFromCompany(company.id, profileId);
    setDetail((prev) =>
      prev ? { ...prev, profiles: prev.profiles.filter((p) => p.id !== profileId) } : prev
    );
    setUnlinkConfirmAccount(null);
  }

  function handleAssignAll(serviceId: string) {
    const svc = company.services.find((s) => s.service_id === serviceId);
    if (!svc) return;
    const members = deptMembers[svc.department_id] ?? [];
    const existingIds = new Set(svc.technicians.map((t) => t.id));
    for (const m of members) {
      if (!existingIds.has(m.id)) {
        onTechAssigned(company.id, serviceId, { id: m.id, name: m.name });
      }
    }
    assignAllTechniciansAdmin(company.id, serviceId, svc.department_id).catch(() => {});
  }

  // Services user can add: chief services NOT already on this company
  const existingServiceIds = new Set(company.services.map((s) => s.service_id));
  const availableToAdd = chiefAvailableServices.filter((s) => !existingServiceIds.has(s.service_id));
  const isChiefOfAny = userChiefDeptIds.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        className="relative w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto animate-slide-in-right"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between z-10">
          <div className="flex-1 min-w-0 pr-4">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  placeholder="Nombre comercial"
                  className="text-lg font-bold text-brand-navy border-b border-brand-teal/50 focus:outline-none focus:border-brand-teal bg-transparent flex-1 min-w-0"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") { setNameValue(company.company_name ?? ""); setEditingName(false); } }}
                />
                <button onClick={handleSaveName} disabled={savingName} className="text-xs text-brand-teal font-medium disabled:opacity-50 cursor-pointer">{savingName ? "..." : "OK"}</button>
                <button onClick={() => { setNameValue(company.company_name ?? ""); setEditingName(false); }} className="text-xs text-text-muted cursor-pointer">&times;</button>
              </div>
            ) : (
              <button onClick={() => setEditingName(true)} className="text-left group/name cursor-pointer" title="Editar nombre comercial">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg font-bold font-heading text-brand-navy truncate group-hover/name:text-brand-navy/80">
                    {company.company_name || company.legal_name}
                  </h2>
                  <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 group-hover/name:text-brand-teal transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                </div>
                {company.company_name && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">{company.legal_name}</p>
                )}
              </button>
            )}
            {company.nif && <p className="text-xs text-text-muted font-mono mt-1">{company.nif}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ---- Services ---- */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Servicios contratados</h3>
              {isChiefOfAny && availableToAdd.length > 0 && !addingService && (
                <button onClick={() => setAddingService(true)} className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium flex items-center gap-1 cursor-pointer">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Añadir
                </button>
              )}
            </div>

            {addingService && (
              <div className="flex items-center gap-2 mb-3">
                <select
                  onChange={(e) => { if (e.target.value) handleAddService(e.target.value); }}
                  defaultValue=""
                  disabled={savingService}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal bg-white cursor-pointer disabled:opacity-50"
                >
                  <option value="" disabled>Selecciona un servicio...</option>
                  {availableToAdd.map((s) => (
                    <option key={s.service_id} value={s.service_id}>{s.service_name}</option>
                  ))}
                </select>
                <button onClick={() => setAddingService(false)} className="text-xs text-text-muted hover:text-text-body cursor-pointer">Cancelar</button>
              </div>
            )}

            {company.services.length === 0 ? (
              <p className="text-sm text-text-muted italic">Sin servicios contratados</p>
            ) : (
              <div className="space-y-2">
                {company.services.map((svc) => {
                  const isChiefOfDept = userChiefDeptIds.includes(svc.department_id);
                  const members = deptMembers[svc.department_id] ?? [];
                  return (
                    <ServiceDetailSection
                      key={svc.service_id}
                      service={svc}
                      isChiefOfDept={isChiefOfDept}
                      members={members}
                      linkPrefix={linkPrefix}
                      companyId={company.id}
                      onAssign={handleAssignTech}
                      onRemove={handleRemoveTech}
                      onRemoveService={handleRemoveService}
                      onAssignAll={handleAssignAll}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- Bank accounts ---- */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Cuentas bancarias</h3>
              {!addingBank && !loadingDetail && (
                <button onClick={() => setAddingBank(true)} className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium flex items-center gap-1 cursor-pointer">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Añadir
                </button>
              )}
            </div>

            {loadingDetail ? (
              <div className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <div className="space-y-2">
                {(detail?.bank_accounts ?? []).length === 0 && !addingBank && (
                  <p className="text-sm text-text-muted bg-gray-50 rounded-lg px-4 py-3">Sin cuentas bancarias</p>
                )}
                {(detail?.bank_accounts ?? []).map((ba) =>
                  editingBankId === ba.id ? (
                    <BankAccountForm key={ba.id} initial={ba} onSave={(iban, label, bankName) => handleUpdateBank(ba.id, iban, label, bankName)} onCancel={() => setEditingBankId(null)} />
                  ) : (
                    <div key={ba.id} className="bg-gray-50 rounded-lg px-4 py-3 group">
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
                          <button onClick={() => setEditingBankId(ba.id)} className="p-1 rounded hover:bg-gray-200 cursor-pointer" title="Editar">
                            <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                          </button>
                          <button onClick={() => handleDeleteBank(ba.id)} disabled={deletingBankId === ba.id} className="p-1 rounded hover:bg-red-100 cursor-pointer disabled:opacity-50" title="Eliminar">
                            <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
                {addingBank && <BankAccountForm onSave={handleAddBank} onCancel={() => setAddingBank(false)} />}
              </div>
            )}
          </section>

          {/* ---- Profiles (lazy) ---- */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Cuentas asociadas</h3>
              {canManageClientAccounts && !addingAccount && !loadingDetail && (
                <button
                  onClick={() => { setAddingAccount(true); setEditingAccountId(null); }}
                  className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Añadir
                </button>
              )}
            </div>

            {loadingDetail ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-12 bg-gray-100 rounded-lg" />
              </div>
            ) : (
              <div className="space-y-2">
                {(detail?.profiles ?? []).length === 0 && !addingAccount && (
                  <p className="text-sm text-text-muted">Sin cuentas asociadas</p>
                )}
                {(detail?.profiles ?? []).map((acc) =>
                  editingAccountId === acc.id ? (
                    <EditClientAccountForm
                      key={acc.id}
                      initial={acc}
                      onSave={(input) => handleUpdateAccount(acc.id, input)}
                      onCancel={() => setEditingAccountId(null)}
                    />
                  ) : (
                    <div key={acc.id} className="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-body truncate">{acc.full_name ?? "Sin nombre"}</p>
                        <p className="text-xs text-text-muted truncate">{acc.email}</p>
                      </div>
                      {canManageClientAccounts && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingAccountId(acc.id); setAddingAccount(false); }}
                            className="p-1 rounded hover:bg-gray-200 cursor-pointer"
                            title="Editar"
                          >
                            <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setUnlinkConfirmAccount(acc)}
                            className="p-1 rounded hover:bg-red-100 cursor-pointer"
                            title="Desvincular"
                          >
                            <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  )
                )}
                {addingAccount && (
                  <AddClientAccountForm
                    existingProfileIds={(detail?.profiles ?? []).map((p) => p.id)}
                    onSubmit={handleAddAccount}
                    onCancel={() => setAddingAccount(false)}
                  />
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {unlinkConfirmAccount && (
        <ConfirmDialog
          title="Desvincular cuenta"
          message={`¿Desvincular ${unlinkConfirmAccount.full_name ?? unlinkConfirmAccount.email} de esta empresa? La cuenta seguirá existiendo y podrás volver a vincularla más tarde.`}
          confirmLabel="Desvincular"
          destructive
          onConfirm={() => handleConfirmUnlink(unlinkConfirmAccount.id)}
          onCancel={() => setUnlinkConfirmAccount(null)}
        />
      )}
    </div>
  );
}
