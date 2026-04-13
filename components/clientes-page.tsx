"use client";

import { useMemo, useRef, useState } from "react";
import type { ClienteCompany, ClienteService, ClientesPageData } from "@/app/admin/clientes/actions";
import ClientDetailPanel from "@/components/client-detail-panel";

// ---- Company Card ----
function CompanyCard({
  company,
  onClick,
}: {
  company: ClienteCompany;
  onClick: () => void;
}) {
  // Unique departments across services
  const deptNames = [...new Set(company.services.map((s) => s.department_name))].filter(Boolean);

  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 hover:shadow-md hover:border-brand-teal/30 transition-all cursor-pointer w-full"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-body truncate">{company.legal_name}</p>
          {company.company_name && (
            <p className="text-xs text-text-muted truncate mt-0.5">{company.company_name}</p>
          )}
          {company.nif && (
            <p className="text-xs text-text-muted font-mono mt-0.5">{company.nif}</p>
          )}
        </div>
        {company.is_assigned && (
          <span className="flex-shrink-0 text-[10px] bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 rounded-full font-medium">
            Asignado
          </span>
        )}
      </div>

      {/* Service + dept badges */}
      {company.services.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {company.services.map((svc) => (
            <span key={svc.service_id} className="text-[10px] bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 rounded-full">
              {svc.service_name}
            </span>
          ))}
        </div>
      )}
      {deptNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {deptNames.map((d) => (
            <span key={d} className="text-[10px] border border-gray-200 text-text-muted px-1.5 py-0.5 rounded-full">
              {d}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ---- Filter pill ----
function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer whitespace-nowrap ${
        active
          ? "bg-brand-navy text-white border-brand-navy"
          : "bg-white text-text-muted border-gray-200 hover:border-gray-300 hover:text-text-body"
      }`}
    >
      {label}
    </button>
  );
}

// ---- Main Component ----
export default function ClientesPage({
  data,
  linkPrefix,
}: {
  data: ClientesPageData;
  linkPrefix: string;
}) {
  const [companies, setCompanies] = useState<ClienteCompany[]>(data.companies);
  const [selectedCompany, setSelectedCompany] = useState<ClienteCompany | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Unique services across all companies (for filter)
  const allServices = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of data.companies) {
      for (const s of c.services) map.set(s.service_id, s.service_name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [data.companies]);

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !c.legal_name.toLowerCase().includes(q) &&
          !(c.company_name ?? "").toLowerCase().includes(q) &&
          !(c.nif ?? "").toLowerCase().includes(q)
        ) return false;
      }
      if (selectedDepts.length > 0) {
        const compDeptIds = c.services.map((s) => s.department_id);
        if (!selectedDepts.some((d) => compDeptIds.includes(d))) return false;
      }
      if (selectedServices.length > 0) {
        const compSvcIds = c.services.map((s) => s.service_id);
        if (!selectedServices.some((s) => compSvcIds.includes(s))) return false;
      }
      if (assignedOnly && !c.is_assigned) return false;
      return true;
    });
  }, [companies, search, selectedDepts, selectedServices, assignedOnly]);

  function toggleDept(id: string) {
    setSelectedDepts((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  }
  function toggleService(id: string) {
    setSelectedServices((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }

  const hasFilters = selectedDepts.length > 0 || selectedServices.length > 0 || assignedOnly;

  // ---- Optimistic updates ----
  function handleUpdateName(companyId: string, name: string | null) {
    setCompanies((prev) =>
      prev.map((c) => c.id === companyId ? { ...c, company_name: name } : c)
    );
    setSelectedCompany((prev) => prev?.id === companyId ? { ...prev, company_name: name } : prev);
  }

  function handleServiceAdded(companyId: string, service: ClienteService) {
    setCompanies((prev) =>
      prev.map((c) => c.id === companyId ? { ...c, services: [...c.services, service] } : c)
    );
    setSelectedCompany((prev) =>
      prev?.id === companyId ? { ...prev, services: [...prev.services, service] } : prev
    );
  }

  function handleServiceRemoved(companyId: string, serviceId: string) {
    setCompanies((prev) =>
      prev.map((c) =>
        c.id === companyId ? { ...c, services: c.services.filter((s) => s.service_id !== serviceId) } : c
      )
    );
    setSelectedCompany((prev) =>
      prev?.id === companyId
        ? { ...prev, services: prev.services.filter((s) => s.service_id !== serviceId) }
        : prev
    );
  }

  function handleTechAssigned(companyId: string, serviceId: string, tech: { id: string; name: string | null }) {
    const update = (c: ClienteCompany) =>
      c.id !== companyId ? c : {
        ...c,
        services: c.services.map((s) =>
          s.service_id !== serviceId ? s : { ...s, technicians: [...s.technicians, tech] }
        ),
      };
    setCompanies((prev) => prev.map(update));
    setSelectedCompany((prev) => prev ? update(prev) : prev);
  }

  function handleTechRemoved(companyId: string, serviceId: string, techId: string) {
    const update = (c: ClienteCompany) =>
      c.id !== companyId ? c : {
        ...c,
        services: c.services.map((s) =>
          s.service_id !== serviceId ? s : { ...s, technicians: s.technicians.filter((t) => t.id !== techId) }
        ),
      };
    setCompanies((prev) => prev.map(update));
    setSelectedCompany((prev) => prev ? update(prev) : prev);
  }

  const hasAssignedCompanies = data.companies.some((c) => c.is_assigned);

  return (
    <div className="min-h-full px-8">
      <div className="max-w-6xl">
        <div className="sticky top-0 bg-surface-gray z-20 pt-12 pb-4 border-b border-gray-200 space-y-4">
          {/* Header */}
          <div>
            <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
            <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">Clientes</h1>
          </div>

          {/* Search + filters */}
          <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[240px] max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar empresa o CIF..."
                className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal bg-white"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {/* Result count */}
            <p className="text-sm text-text-muted">
              {search.trim() || hasFilters
                ? `${filtered.length} de ${companies.length}`
                : companies.length}{" "}
              {companies.length === 1 ? "cliente" : "clientes"}
            </p>

            {/* Clear filters */}
            {(hasFilters || search) && (
              <button
                onClick={() => { setSearch(""); setSelectedDepts([]); setSelectedServices([]); setAssignedOnly(false); }}
                className="text-xs text-text-muted hover:text-text-body cursor-pointer underline underline-offset-2"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div className="space-y-2">
            {hasAssignedCompanies && (
              <div className="flex items-center gap-2 flex-wrap">
                <FilterPill
                  label="Mis asignadas"
                  active={assignedOnly}
                  onClick={() => setAssignedOnly((v) => !v)}
                />
              </div>
            )}

            {data.departments.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-muted font-medium w-24 shrink-0">Departamentos</span>
                {data.departments.map((d) => (
                  <FilterPill
                    key={d.id}
                    label={d.name}
                    active={selectedDepts.includes(d.id)}
                    onClick={() => toggleDept(d.id)}
                  />
                ))}
              </div>
            )}

            {allServices.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-muted font-medium w-24 shrink-0">Servicios</span>
                {allServices.map((s) => (
                  <FilterPill
                    key={s.id}
                    label={s.name}
                    active={selectedServices.includes(s.id)}
                    onClick={() => toggleService(s.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Grid */}
        <div className="pt-6 pb-12">
          {companies.length === 0 ? (
            <p className="text-sm text-text-muted italic">Sin clientes</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-text-muted">Sin resultados para los filtros aplicados</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((c) => (
                <CompanyCard key={c.id} company={c} onClick={() => setSelectedCompany(c)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedCompany && (
        <ClientDetailPanel
          company={selectedCompany}
          userChiefDeptIds={data.userChiefDeptIds}
          deptMembers={data.deptMembers}
          chiefAvailableServices={data.chiefAvailableServices}
          linkPrefix={linkPrefix}
          onClose={() => setSelectedCompany(null)}
          onUpdateName={handleUpdateName}
          onServiceAdded={handleServiceAdded}
          onServiceRemoved={handleServiceRemoved}
          onTechAssigned={handleTechAssigned}
          onTechRemoved={handleTechRemoved}
        />
      )}
    </div>
  );
}
