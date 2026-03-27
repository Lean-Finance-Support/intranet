"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { DepartmentInfo, DeptCompany, DeptCompanyService, DeptMember } from "@/app/admin/departamento/actions";
import {
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

// ---------- Service Section within Company Card ----------
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
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full font-medium">{service.service_name}</span>
      </div>
      {service.technicians.length === 0 ? (
        <p className="text-xs text-text-muted italic mb-1">Sin técnicos</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mb-1">
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
            <button onClick={() => onAssignAll(companyId, service.service_id)} className="text-[11px] text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer">
              Asignar todos
            </button>
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

      <div className="space-y-3">
        {company.services.map((svc) => (
          <ServiceSection key={svc.service_id} service={svc} members={members} isChief={isChief}
            companyId={company.id} onAssign={onAssign} onRemove={onRemove} onAssignAll={onAssignAll} />
        ))}
      </div>
    </div>
  );
}

// ---------- Members Panel ----------
function MembersPanel({ members }: { members: DeptMember[] }) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {members.map((m) => (
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
  );
}

// ---------- Companies Panel ----------
function CompaniesPanel({ dept, onAssign, onRemove, onAssignAll, onUpdateName }: {
  dept: DepartmentInfo;
  onAssign: (companyId: string, serviceId: string, techId: string) => void;
  onRemove: (companyId: string, serviceId: string, techId: string) => void;
  onAssignAll: (companyId: string, serviceId: string) => void;
  onUpdateName: (companyId: string, name: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return dept.companies;
    const q = search.trim().toLowerCase();
    return dept.companies.filter((c) =>
      c.legal_name.toLowerCase().includes(q) ||
      (c.company_name ?? "").toLowerCase().includes(q) ||
      (c.nif ?? "").toLowerCase().includes(q)
    );
  }, [dept.companies, search]);

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          {dept.is_chief ? "Clientes del departamento" : "Mis clientes"} · {search.trim() ? `${filtered.length} de ${dept.companies.length}` : dept.companies.length}
        </p>
        {dept.companies.length > 0 && (
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
        )}
      </div>

      {dept.companies.length === 0 ? (
        <p className="text-sm text-text-muted italic">Sin clientes asignados</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-text-muted">Sin resultados para &ldquo;{search}&rdquo;</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <CompanyCard key={c.id} company={c} members={dept.members} isChief={dept.is_chief}
              onAssign={onAssign} onRemove={onRemove} onAssignAll={onAssignAll} onUpdateName={onUpdateName} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Department Section (with tabs) ----------
type DeptTab = "clientes" | "miembros";

function DepartmentSection({ dept, onAssign, onRemove, onAssignAll, onUpdateName }: {
  dept: DepartmentInfo;
  onAssign: (companyId: string, serviceId: string, techId: string) => void;
  onRemove: (companyId: string, serviceId: string, techId: string) => void;
  onAssignAll: (companyId: string, serviceId: string) => void;
  onUpdateName: (companyId: string, name: string | null) => void;
}) {
  const [tab, setTab] = useState<DeptTab>("clientes");

  const tabs: { id: DeptTab; label: string; count?: number }[] = [
    { id: "clientes", label: "Clientes", count: dept.companies.length },
    { id: "miembros", label: "Miembros", count: dept.members.length },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-brand-navy">{dept.department_name}</h2>
        {dept.is_chief && (
          <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full font-medium">Responsable</span>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                tab === t.id
                  ? "border-brand-teal text-brand-teal"
                  : "border-transparent text-text-muted hover:text-text-body hover:border-gray-300"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  tab === t.id ? "bg-brand-teal/10 text-brand-teal" : "bg-gray-100 text-text-muted"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {tab === "clientes" && (
        <CompaniesPanel
          dept={dept}
          onAssign={onAssign}
          onRemove={onRemove}
          onAssignAll={onAssignAll}
          onUpdateName={onUpdateName}
        />
      )}
      {tab === "miembros" && <MembersPanel members={dept.members} />}
    </div>
  );
}

// ---------- Main Component ----------
export default function DepartamentoPage({ departments }: { departments: DepartmentInfo[] }) {
  const [data, setData] = useState<DepartmentInfo[]>(departments);
  const [activeDeptIndex, setActiveDeptIndex] = useState(0);

  const reload = useCallback(async () => {
    // no-op: optimistic updates handle state locally
  }, []);

  function handleAssign(deptId: string, companyId: string, serviceId: string, techId: string) {
    setData((prev) => prev.map((dept) => {
      if (dept.department_id !== deptId) return dept;
      const member = dept.members.find((m) => m.id === techId);
      return {
        ...dept,
        companies: dept.companies.map((c) =>
          c.id === companyId
            ? { ...c, services: c.services.map((svc) => svc.service_id === serviceId ? { ...svc, technicians: [...svc.technicians, { technician_id: techId, technician_name: member?.full_name ?? null }] } : svc) }
            : c
        ),
      };
    }));
    assignTechnician(companyId, serviceId, techId).catch(() => reload());
  }

  function handleRemove(deptId: string, companyId: string, serviceId: string, techId: string) {
    setData((prev) => prev.map((dept) => {
      if (dept.department_id !== deptId) return dept;
      return {
        ...dept,
        companies: dept.companies.map((c) =>
          c.id === companyId
            ? { ...c, services: c.services.map((svc) => svc.service_id === serviceId ? { ...svc, technicians: svc.technicians.filter((t) => t.technician_id !== techId) } : svc) }
            : c
        ),
      };
    }));
    removeTechnician(companyId, serviceId, techId).catch(() => reload());
  }

  function handleAssignAll(deptId: string, companyId: string, serviceId: string) {
    setData((prev) => prev.map((dept) => {
      if (dept.department_id !== deptId) return dept;
      const company = dept.companies.find((c) => c.id === companyId);
      const service = company?.services.find((s) => s.service_id === serviceId);
      const existingIds = new Set(service?.technicians.map((t) => t.technician_id) ?? []);
      const newTechs = dept.members.filter((m) => !existingIds.has(m.id)).map((m) => ({ technician_id: m.id, technician_name: m.full_name }));
      return {
        ...dept,
        companies: dept.companies.map((c) =>
          c.id === companyId
            ? { ...c, services: c.services.map((svc) => svc.service_id === serviceId ? { ...svc, technicians: [...svc.technicians, ...newTechs] } : svc) }
            : c
        ),
      };
    }));
    assignAllMembers(companyId, serviceId, deptId).catch(() => reload());
  }

  function handleUpdateName(deptId: string, companyId: string, name: string | null) {
    setData((prev) => prev.map((dept) => {
      if (dept.department_id !== deptId) return dept;
      return { ...dept, companies: dept.companies.map((c) => c.id === companyId ? { ...c, company_name: name } : c) };
    }));
    updateCompanyName(companyId, name).catch(() => reload());
  }

  if (data.length === 0) {
    return (
      <div className="min-h-full px-8 py-12">
        <div className="max-w-6xl">
          <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
          <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight mb-6">Mi departamento</h1>
          <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4">Sin departamento asignado</div>
        </div>
      </div>
    );
  }

  const activeDept = data[activeDeptIndex] ?? data[0];

  return (
    <div className="min-h-full px-8 py-12">
      <div className="max-w-6xl space-y-8">
        <div>
          <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
          <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">Mi departamento</h1>
        </div>

        {/* Department selector tabs (only shown when user has multiple departments) */}
        {data.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {data.map((dept, idx) => (
              <button
                key={dept.department_id}
                onClick={() => setActiveDeptIndex(idx)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  activeDeptIndex === idx
                    ? "bg-brand-navy text-white"
                    : "bg-white border border-gray-200 text-text-body hover:border-brand-navy/30 hover:text-brand-navy"
                }`}
              >
                {dept.department_name}
                {dept.is_chief && (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${activeDeptIndex === idx ? "bg-white/20 text-white" : "bg-brand-teal/10 text-brand-teal"}`}>
                    Responsable
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <DepartmentSection
          key={activeDept.department_id}
          dept={activeDept}
          onAssign={(companyId, serviceId, techId) => handleAssign(activeDept.department_id, companyId, serviceId, techId)}
          onRemove={(companyId, serviceId, techId) => handleRemove(activeDept.department_id, companyId, serviceId, techId)}
          onAssignAll={(companyId, serviceId) => handleAssignAll(activeDept.department_id, companyId, serviceId)}
          onUpdateName={(companyId, name) => handleUpdateName(activeDept.department_id, companyId, name)}
        />
      </div>
    </div>
  );
}
