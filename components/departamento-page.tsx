"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { DepartmentInfo, DeptCompany, DeptMember } from "@/app/admin/departamento/actions";
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

// ---------- Company Card ----------
function CompanyCard({ company, members, isChief, onAssign, onRemove, onAssignAll, onUpdateName }: {
  company: DeptCompany;
  members: DeptMember[];
  isChief: boolean;
  onAssign: (companyId: string, techId: string) => void;
  onRemove: (companyId: string, techId: string) => void;
  onAssignAll: (companyId: string) => void;
  onUpdateName: (companyId: string, name: string | null) => void;
}) {
  const existingTechIds = new Set(company.technicians.map((t) => t.technician_id));
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
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-body">{company.legal_name}</p>
          {editingName ? (
            <div className="flex items-center gap-1.5 mt-1">
              <input type="text" value={nameValue} onChange={(e) => setNameValue(e.target.value)} placeholder="Nombre comercial"
                className="text-xs border border-gray-200 rounded px-2 py-1 flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-brand-teal/50 focus:border-brand-teal" autoFocus />
              <button onClick={handleSaveName} disabled={savingName} className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer disabled:opacity-50">
                {savingName ? "..." : "OK"}
              </button>
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

      <div className="flex flex-wrap gap-1 mb-3">
        {company.services.map((s) => (
          <span key={s} className="text-[10px] bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full font-medium">{s}</span>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-text-muted">Técnicos asignados:</p>
        {company.technicians.length === 0 ? (
          <p className="text-xs text-text-muted italic">Sin técnicos</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {company.technicians.map((t) => (
              <span key={t.technician_id} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
                <span className="text-text-body">{t.technician_name ?? "Desconocido"}</span>
                {isChief && (
                  <button onClick={() => onRemove(company.id, t.technician_id)} className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer" title="Quitar técnico">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {isChief && (
          <div className="flex items-center gap-2 pt-1">
            <TechnicianSelector members={members} existingIds={existingTechIds} onSelect={(techId) => onAssign(company.id, techId)} />
            {members.length > company.technicians.length && (
              <button onClick={() => onAssignAll(company.id)} className="text-[11px] text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer">
                Asignar todos
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main Component ----------
export default function DepartamentoPage() {
  const [info, setInfo] = useState<DepartmentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getDepartmentInfo();
      setInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  const filtered = useMemo(() => {
    if (!info) return [];
    if (!search.trim()) return info.companies;
    const q = search.trim().toLowerCase();
    return info.companies.filter((c) =>
      c.legal_name.toLowerCase().includes(q) ||
      (c.company_name ?? "").toLowerCase().includes(q) ||
      (c.nif ?? "").toLowerCase().includes(q)
    );
  }, [info, search]);

  function handleAssign(companyId: string, techId: string) {
    setInfo((prev) => {
      if (!prev) return prev;
      const member = prev.members.find((m) => m.id === techId);
      return {
        ...prev,
        companies: prev.companies.map((c) =>
          c.id === companyId
            ? { ...c, technicians: [...c.technicians, { id: `temp-${techId}`, technician_id: techId, technician_name: member?.full_name ?? null }] }
            : c
        ),
      };
    });
    assignTechnician(companyId, techId).catch(() => {
      setInfo((prev) => prev ? {
        ...prev,
        companies: prev.companies.map((c) =>
          c.id === companyId ? { ...c, technicians: c.technicians.filter((t) => t.technician_id !== techId) } : c
        ),
      } : prev);
    });
  }

  function handleRemove(companyId: string, techId: string) {
    const prevTechnicians = info?.companies.find((c) => c.id === companyId)?.technicians ?? [];
    setInfo((prev) => prev ? {
      ...prev,
      companies: prev.companies.map((c) =>
        c.id === companyId ? { ...c, technicians: c.technicians.filter((t) => t.technician_id !== techId) } : c
      ),
    } : prev);
    removeTechnician(companyId, techId).catch(() => {
      setInfo((prev) => prev ? {
        ...prev,
        companies: prev.companies.map((c) => c.id === companyId ? { ...c, technicians: prevTechnicians } : c),
      } : prev);
    });
  }

  function handleAssignAll(companyId: string) {
    setInfo((prev) => {
      if (!prev) return prev;
      const company = prev.companies.find((c) => c.id === companyId);
      const existingIds = new Set(company?.technicians.map((t) => t.technician_id) ?? []);
      const newTechs = prev.members.filter((m) => !existingIds.has(m.id)).map((m) => ({ id: `temp-${m.id}`, technician_id: m.id, technician_name: m.full_name }));
      return { ...prev, companies: prev.companies.map((c) => c.id === companyId ? { ...c, technicians: [...c.technicians, ...newTechs] } : c) };
    });
    assignAllMembers(companyId).catch(() => loadInfo());
  }

  function handleUpdateName(companyId: string, name: string | null) {
    setInfo((prev) => prev ? { ...prev, companies: prev.companies.map((c) => c.id === companyId ? { ...c, company_name: name } : c) } : prev);
    updateCompanyName(companyId, name).catch(() => loadInfo());
  }

  return (
    <div className="min-h-full px-8 py-12">
      <div className="max-w-6xl">
        <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
        <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight mb-8">
          {info?.department_name ?? "Mi departamento"}
        </h1>

        {loading && (
          <div className="space-y-6 animate-pulse">
            <div><div className="h-3 w-36 bg-gray-300 rounded mb-3" /><div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-16 bg-gray-200 rounded-xl" />)}</div></div>
            <div className="h-12 bg-gray-200 rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{[1,2,3,4,5,6].map((i) => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}</div>
          </div>
        )}

        {error && <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4">{error}</div>}

        {info && !loading && (
          <div className="space-y-10">
            {/* Miembros */}
            <section>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Miembros del departamento</p>
              <div className="flex flex-wrap gap-2">
                {info.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 bg-white rounded-full px-3 py-2 border border-gray-100 shadow-sm">
                    <div className="w-6 h-6 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                    <span className="text-sm text-text-body">{m.full_name ?? m.email}</span>
                    {m.is_chief && <span className="text-[10px] bg-brand-navy/10 text-brand-navy px-1.5 py-0.5 rounded-full font-medium">Responsable</span>}
                  </div>
                ))}
              </div>
            </section>

            {/* Clientes */}
            <section>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {info.is_chief ? "Clientes del departamento" : "Mis clientes"} · {search.trim() ? `${filtered.length} de ${info.companies.length}` : info.companies.length}
                </p>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa o CIF..."
                    className="text-sm border border-gray-200 rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal w-64 bg-white" />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="text-center py-16">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <p className="text-sm text-text-muted">{search.trim() ? `Sin resultados para "${search}"` : "Sin clientes asignados"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filtered.map((c) => (
                    <CompanyCard key={c.id} company={c} members={info.members} isChief={info.is_chief}
                      onAssign={handleAssign} onRemove={handleRemove} onAssignAll={handleAssignAll} onUpdateName={handleUpdateName} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
