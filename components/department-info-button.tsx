"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type {
  DepartmentInfo,
  DeptCompany,
  DeptCompanyService,
  DeptMember,
} from "@/app/admin/departamento/actions";
import {
  getDepartmentInfo,
  assignTechnician,
  removeTechnician,
  assignAllMembers,
  updateCompanyName,
} from "@/app/admin/departamento/actions";

// ---------- Technician Selector ----------
function TechnicianSelector({ members, existingIds, onSelect }: {
  members: DeptMember[];
  existingIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const available = members.filter((m) => !existingIds.has(m.id));
  if (available.length === 0) return null;

  return (
    <select
      onChange={(e) => { if (e.target.value) onSelect(e.target.value); e.target.value = ""; }}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal bg-white cursor-pointer"
      defaultValue=""
    >
      <option value="" disabled>+ Añadir técnico</option>
      {available.map((m) => <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>)}
    </select>
  );
}

// ---------- Service Section ----------
function ServiceSection({ service, members, isChief, companyId, onAssign, onRemove, onAssignAll }: {
  service: DeptCompanyService;
  members: DeptMember[];
  isChief: boolean;
  companyId: string;
  onAssign: (companyId: string, serviceId: string, techId: string) => void;
  onRemove: (companyId: string, serviceId: string, techId: string) => void;
  onAssignAll: (companyId: string, serviceId: string) => void;
}) {
  const existingTechIds = new Set(service.technicians.map((t) => t.technician_id));
  return (
    <div className="border-t border-gray-50 pt-2 first:border-t-0 first:pt-0">
      <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full font-medium">{service.service_name}</span>
      {service.technicians.length === 0 ? (
        <p className="text-xs text-text-muted italic mt-1 mb-1">Sin técnicos</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mt-1 mb-1">
          {service.technicians.map((t) => (
            <span key={t.technician_id} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
              <span className="text-text-body">{t.technician_name ?? "Desconocido"}</span>
              {isChief && (
                <button onClick={() => onRemove(companyId, service.service_id, t.technician_id)} className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer" title="Quitar técnico">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {isChief && (
        <div className="flex items-center gap-2">
          <TechnicianSelector members={members} existingIds={existingTechIds} onSelect={(techId) => onAssign(companyId, service.service_id, techId)} />
          {members.length > service.technicians.length && (
            <button onClick={() => onAssignAll(companyId, service.service_id)} className="text-[11px] text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer">Asignar todos</button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Company Card ----------
function CompanyCard({ company, members, isChief, onAssign, onRemove, onAssignAll, onUpdateName }: {
  company: DeptCompany;
  members: DeptMember[];
  isChief: boolean;
  onAssign: (companyId: string, serviceId: string, techId: string) => void;
  onRemove: (companyId: string, serviceId: string, techId: string) => void;
  onAssignAll: (companyId: string, serviceId: string) => void;
  onUpdateName: (companyId: string, name: string | null) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(company.company_name ?? "");
  const [savingName, setSavingName] = useState(false);

  async function handleSaveName() {
    setSavingName(true);
    try { await onUpdateName(company.id, nameValue || null); setEditingName(false); }
    finally { setSavingName(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-body">{company.legal_name}</p>
          {editingName ? (
            <div className="flex items-center gap-1.5 mt-1">
              <input type="text" value={nameValue} onChange={(e) => setNameValue(e.target.value)} placeholder="Nombre comercial"
                className="text-xs border border-gray-200 rounded px-2 py-1 flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-brand-teal/50 focus:border-brand-teal" autoFocus />
              <button onClick={handleSaveName} disabled={savingName} className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer disabled:opacity-50">{savingName ? "..." : "OK"}</button>
              <button onClick={() => { setNameValue(company.company_name ?? ""); setEditingName(false); }} className="text-xs text-text-muted hover:text-text-body cursor-pointer">&times;</button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="text-xs text-text-muted hover:text-brand-teal mt-0.5 cursor-pointer flex items-center gap-1" title="Editar nombre comercial">
              {company.company_name ? <span>{company.company_name}</span> : <span className="italic">Añadir nombre comercial</span>}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
            </button>
          )}
          {company.nif && <p className="text-xs text-text-muted font-mono mt-0.5">{company.nif}</p>}
        </div>
      </div>
      <div className="space-y-3">
        {company.services.map((svc) => (
          <ServiceSection key={svc.service_id} service={svc} members={members} isChief={isChief}
            companyId={company.id} onAssign={onAssign} onRemove={onRemove} onAssignAll={onAssignAll} />
        ))}
      </div>
    </div>
  );
}

// ---------- Full-screen clients view ----------
function ClientsFullScreen({ info, onClose, onAssign, onRemove, onAssignAll, onUpdateName }: {
  info: DepartmentInfo;
  onClose: () => void;
  onAssign: (companyId: string, serviceId: string, techId: string) => void;
  onRemove: (companyId: string, serviceId: string, techId: string) => void;
  onAssignAll: (companyId: string, serviceId: string) => void;
  onUpdateName: (companyId: string, name: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return info.companies;
    const q = search.trim().toLowerCase();
    return info.companies.filter((c) =>
      c.legal_name.toLowerCase().includes(q) || (c.company_name ?? "").toLowerCase().includes(q) || (c.nif ?? "").toLowerCase().includes(q)
    );
  }, [info.companies, search]);

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] bg-surface-gray flex flex-col animate-in fade-in duration-150">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold font-heading text-brand-navy">{info.is_chief ? "Clientes del departamento" : "Mis clientes"}</h1>
            <p className="text-xs text-text-muted">{info.department_name}</p>
          </div>
          <span className="text-sm text-text-muted flex-shrink-0">
            {search.trim() ? `${filtered.length} de ${info.companies.length}` : `${info.companies.length} empresa${info.companies.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex-shrink-0">
        <div className="max-w-6xl mx-auto">
          <div className="relative max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o CIF..."
              className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal" />
            {search && (
              <button onClick={() => { setSearch(""); searchRef.current?.focus(); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <p className="text-sm text-text-muted">{search.trim() ? <>Sin resultados para &ldquo;{search}&rdquo;</> : "Sin clientes asignados"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((c) => (
                <CompanyCard key={c.id} company={c} members={info.members} isChief={info.is_chief}
                  onAssign={onAssign} onRemove={onRemove} onAssignAll={onAssignAll} onUpdateName={onUpdateName} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Main Component ----------
interface DepartmentInfoButtonProps {
  departmentId: string;
  externalOpen?: boolean;
  onExternalClose?: () => void;
}

export default function DepartmentInfoButton({ departmentId, externalOpen, onExternalClose }: DepartmentInfoButtonProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (externalOpen !== undefined) { if (!v) onExternalClose?.(); }
    else { setInternalOpen(v); }
  };
  const [clientsView, setClientsView] = useState(false);
  const [info, setInfo] = useState<DepartmentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const loadInfo = useCallback(async () => {
    setLoading(true); setError("");
    try { setInfo(await getDepartmentInfo(departmentId)); }
    catch (err) { setError(err instanceof Error ? err.message : "Error al cargar"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open && !info) loadInfo(); }, [open, info, loadInfo]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false); }
    if (open && !clientsView) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, clientsView]);

  function handleAssign(companyId: string, serviceId: string, techId: string) {
    setInfo((prev) => {
      if (!prev) return prev;
      const member = prev.members.find((m) => m.id === techId);
      return { ...prev, companies: prev.companies.map((c) => c.id === companyId ? {
        ...c, services: c.services.map((svc) => svc.service_id === serviceId
          ? { ...svc, technicians: [...svc.technicians, { technician_id: techId, technician_name: member?.full_name ?? null }] }
          : svc)
      } : c) };
    });
    assignTechnician(companyId, serviceId, techId).catch(() => loadInfo());
  }

  function handleRemove(companyId: string, serviceId: string, techId: string) {
    setInfo((prev) => prev ? { ...prev, companies: prev.companies.map((c) => c.id === companyId ? {
      ...c, services: c.services.map((svc) => svc.service_id === serviceId
        ? { ...svc, technicians: svc.technicians.filter((t) => t.technician_id !== techId) }
        : svc)
    } : c) } : prev);
    removeTechnician(companyId, serviceId, techId).catch(() => loadInfo());
  }

  function handleAssignAll(companyId: string, serviceId: string) {
    setInfo((prev) => {
      if (!prev) return prev;
      const svc = prev.companies.find((c) => c.id === companyId)?.services.find((s) => s.service_id === serviceId);
      const existingIds = new Set(svc?.technicians.map((t) => t.technician_id) ?? []);
      const newTechs = prev.members.filter((m) => !existingIds.has(m.id)).map((m) => ({ technician_id: m.id, technician_name: m.full_name }));
      return { ...prev, companies: prev.companies.map((c) => c.id === companyId ? {
        ...c, services: c.services.map((s) => s.service_id === serviceId ? { ...s, technicians: [...s.technicians, ...newTechs] } : s)
      } : c) };
    });
    assignAllMembers(companyId, serviceId, info?.department_id ?? departmentId).catch(() => loadInfo());
  }

  function handleUpdateName(companyId: string, name: string | null) {
    setInfo((prev) => prev ? { ...prev, companies: prev.companies.map((c) => c.id === companyId ? { ...c, company_name: name } : c) } : prev);
    updateCompanyName(companyId, name).catch(() => loadInfo());
  }

  return (
    <>
      {externalOpen === undefined && (
        <div className="fixed bottom-18 right-4 z-50 group/btn">
          <button onClick={() => setInternalOpen(true)} className="w-10 h-10 rounded-full bg-white/90 backdrop-blur border border-gray-200 shadow-lg hover:shadow-xl hover:bg-white transition-all flex items-center justify-center cursor-pointer" aria-label="Mi departamento">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </button>
          <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-gray-900 text-white text-xs whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 delay-300 pointer-events-none">Mi departamento</span>
        </div>
      )}

      {open && !clientsView && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div ref={panelRef} className="relative w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold font-heading text-brand-navy">{info?.department_name ?? "Departamento"}</h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-6">
              {loading && <div className="space-y-6 animate-pulse"><div><div className="h-3 w-36 bg-gray-200 rounded mb-3" /><div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-[60px] bg-gray-100 rounded-lg" />)}</div></div></div>}
              {error && <div className="text-sm text-red-500 bg-red-50 rounded-lg p-3">{error}</div>}
              {info && !loading && (
                <>
                  <section>
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Miembros del departamento</h3>
                    <div className="space-y-2">
                      {info.members.map((m) => (
                        <div key={m.id} className="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-text-body truncate">{m.full_name ?? "Sin nombre"}</p>
                              {m.is_chief && <span className="text-[10px] bg-brand-navy/10 text-brand-navy px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Responsable</span>}
                            </div>
                            <p className="text-xs text-text-muted truncate">{m.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section>
                    <button onClick={() => setClientsView(true)} className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 transition-colors cursor-pointer group">
                      <div className="w-10 h-10 bg-brand-teal/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-text-body group-hover:text-brand-teal transition-colors">{info.is_chief ? "Clientes del departamento" : "Mis clientes"}</p>
                        <p className="text-xs text-text-muted">{info.companies.length} empresa{info.companies.length !== 1 ? "s" : ""}</p>
                      </div>
                      <svg className="w-5 h-5 text-text-muted group-hover:text-brand-teal transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {clientsView && info && (
        <ClientsFullScreen info={info} onClose={() => setClientsView(false)}
          onAssign={handleAssign} onRemove={handleRemove} onAssignAll={handleAssignAll} onUpdateName={handleUpdateName} />
      )}
    </>
  );
}
