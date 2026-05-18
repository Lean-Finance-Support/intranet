"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ClienteCompany, ClientesPageData } from "@/app/admin/clientes/actions";
import { createCompanyAdmin } from "@/app/admin/clientes/actions";
import dynamic from "next/dynamic";
import { useMediaQuery } from "@/lib/use-media-query";

// Panel y modal solo aparecen al seleccionar/crear empresa: lazy split.
const ClientDetailPanel = dynamic(
  () => import("@/components/client-detail-panel"),
  { ssr: false },
);
const NewCompanyModal = dynamic(
  () => import("@/components/new-company-modal"),
  { ssr: false },
);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

// ---- Company Card ----
function CompanyCard({
  company,
  deptNameById,
  onClick,
}: {
  company: ClienteCompany;
  deptNameById: Map<string, string>;
  onClick: () => void;
}) {
  // Departamentos del equipo responsable (técnicos asignados + supervisores de doc)
  const teamDeptNames = company.responsible_team_dept_ids
    .map((id) => deptNameById.get(id))
    .filter((n): n is string => !!n);
  const docProgress = company.documentation_progress;
  const docPct =
    docProgress && docProgress.total > 0
      ? Math.round((docProgress.validated / docProgress.total) * 100)
      : 0;

  return (
    <button
      onClick={onClick}
      className="relative text-left bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 hover:shadow-md hover:border-brand-teal/30 transition-all cursor-pointer w-full"
    >
      {company.is_assigned && (
        <span className="absolute top-3 right-3 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">
          Asignado
        </span>
      )}
      <div className="mb-2 pr-16">
        <p className="text-sm font-semibold text-text-body truncate">{company.legal_name}</p>
        {company.company_name && (
          <p className="text-xs text-text-muted truncate mt-0.5">{company.company_name}</p>
        )}
        {company.nif && (
          <p className="text-xs text-text-muted font-mono mt-0.5">{company.nif}</p>
        )}
      </div>

      {/* Departamentos implicados (equipo responsable) */}
      {teamDeptNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {teamDeptNames.map((d) => (
            <span key={d} className="text-[10px] bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 rounded-full">
              {d}
            </span>
          ))}
        </div>
      )}

      {docProgress && docProgress.total > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-teal transition-all" style={{ width: `${docPct}%` }} />
          </div>
          <span className="text-[10px] text-text-muted font-medium tabular-nums">
            {docPct}%
          </span>
          {docProgress.in_review > 0 && (
            <span className="text-[10px] text-brand-blue font-medium tabular-nums">
              {docProgress.in_review} a revisar
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ---- Deleted Company Card ----
function DeletedCompanyCard({
  company,
  onClick,
}: {
  company: ClienteCompany;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-gray-50 rounded-xl border border-gray-200 px-5 py-4 hover:bg-gray-100 hover:border-gray-300 transition-all cursor-pointer w-full opacity-70"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-muted truncate">{company.legal_name}</p>
          {company.company_name && (
            <p className="text-xs text-text-muted truncate mt-0.5">{company.company_name}</p>
          )}
          {company.nif && (
            <p className="text-xs text-text-muted font-mono mt-0.5">{company.nif}</p>
          )}
        </div>
        {company.deleted_at && (
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] bg-gray-200 text-text-muted px-1.5 py-0.5 rounded-full font-medium">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M5.272 5.79c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Eliminada {formatDate(company.deleted_at)}
          </span>
        )}
      </div>
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

// ---- Filter dropdown (multi-select con checkboxes) ----
function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = selected.length;
  const active = count > 0;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer whitespace-nowrap ${
          active
            ? "bg-brand-navy text-white border-brand-navy"
            : "bg-white text-text-muted border-gray-200 hover:border-gray-300 hover:text-text-body"
        }`}
      >
        <span>{label}</span>
        {active && (
          <span
            className={`inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-semibold tabular-nums ${
              active ? "bg-white/20 text-white" : "bg-gray-100 text-text-muted"
            }`}
          >
            {count}
          </span>
        )}
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 mt-2 z-30 w-64 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="max-h-72 overflow-y-auto py-1">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-muted italic">Sin opciones</p>
            ) : (
              options.map((opt) => {
                const checked = selected.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(opt.id)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-teal focus:ring-brand-teal/30 cursor-pointer"
                    />
                    <span className="text-sm text-text-body truncate">{opt.name}</span>
                  </label>
                );
              })
            )}
          </div>
          {active && (
            <div className="border-t border-gray-100 px-3 py-2">
              <button
                onClick={onClear}
                className="text-xs text-text-muted hover:text-text-body cursor-pointer underline underline-offset-2"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Dropdown "Nuevo" (agrupa alta de cliente / importar / onboarding) ----
function NuevoClienteDropdown({
  linkPrefix,
  canOnboarding,
  onNuevoCliente,
}: {
  linkPrefix: string;
  canOnboarding: boolean;
  onNuevoCliente: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const itemClass =
    "flex items-start gap-2.5 w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center gap-1.5 bg-brand-teal text-white text-sm font-medium px-3.5 py-1.5 rounded-lg hover:bg-brand-teal/90 transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Nuevo
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-30 w-72 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden py-1">
          <button
            onClick={() => {
              setOpen(false);
              onNuevoCliente();
            }}
            className={itemClass}
          >
            <svg className="w-4 h-4 mt-0.5 text-brand-teal shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>
              <span className="block text-sm font-medium text-text-body">Nuevo cliente</span>
              <span className="block text-[11px] text-text-muted">Alta rápida de una empresa.</span>
            </span>
          </button>
          {canOnboarding && (
            <>
              <Link
                href={`${linkPrefix}/clientes/onboarding`}
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <svg className="w-4 h-4 mt-0.5 text-brand-teal shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>
                  <span className="block text-sm font-medium text-text-body">Nuevo onboarding</span>
                  <span className="block text-[11px] text-text-muted">Wizard completo de alta de cliente.</span>
                </span>
              </Link>
              <Link
                href={`${linkPrefix}/clientes/onboarding/importar`}
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <svg className="w-4 h-4 mt-0.5 text-brand-teal shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
                <span>
                  <span className="block text-sm font-medium text-text-body">Importar propuesta</span>
                  <span className="block text-[11px] text-text-muted">Sube el PDF y la IA extrae los datos.</span>
                </span>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main Component ----
export default function ClientesPage({
  data,
  linkPrefix,
  canViewTaxModels,
}: {
  data: ClientesPageData;
  linkPrefix: string;
  canViewTaxModels: boolean;
}) {
  const router = useRouter();
  // Tailwind `md` = 768px. En desktop (≥md) se abre el sidebar de detalle;
  // en móvil se navega directo a la vista expandida.
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [companies, setCompanies] = useState<ClienteCompany[]>(data.companies);
  const [selectedCompany, setSelectedCompany] = useState<ClienteCompany | null>(null);
  // El buscador global (Cmd/Ctrl+K) navega a `/clientes?nuevo=1` para abrir el
  // modal de alta: el estado inicial lo deriva del parámetro y el efecto solo
  // limpia la URL (sin tocar estado, para no reabrir el modal al cerrarlo).
  const searchParams = useSearchParams();
  const openNewFromQuery = searchParams.get("nuevo") !== null;
  const [creatingCompany, setCreatingCompany] = useState(openNewFromQuery);
  useEffect(() => {
    if (openNewFromQuery) {
      router.replace(`${linkPrefix}/clientes`);
    }
  }, [openNewFromQuery, router, linkPrefix]);

  function handleSelectCompany(company: ClienteCompany) {
    if (isDesktop) {
      setSelectedCompany(company);
    } else {
      router.push(`${linkPrefix}/clientes/${company.id}`);
    }
  }

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

  // Lookup name → id de los departamentos disponibles
  const deptNameById = useMemo(
    () => new Map(data.departments.map((d) => [d.id, d.name])),
    [data.departments]
  );

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
        if (!selectedDepts.some((d) => c.responsible_team_dept_ids.includes(d))) return false;
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

  function handleCompanyCreated(company: ClienteCompany) {
    setCompanies((prev) => [company, ...prev]);
    setCreatingCompany(false);
    // En móvil saltamos directos a la ficha completa; en desktop abrimos el panel.
    if (isDesktop) {
      setSelectedCompany(company);
    } else {
      router.push(`${linkPrefix}/clientes/${company.id}`);
    }
  }

  const activeCount = companies.filter((c) => !c.deleted_at).length;
  const hasAssignedCompanies = data.companies.some((c) => c.is_assigned && !c.deleted_at);

  return (
    <div className="min-h-full px-8">
      <div className="max-w-screen-2xl">
        <div className="sticky top-0 bg-surface-gray z-20 pt-6 pb-3 border-b border-gray-200 space-y-3">
          {/* Header compacto: subtítulo + título + acciones a la derecha en línea */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-brand-teal text-xs font-medium leading-none mb-1">Portal de empleados</p>
              <h1 className="text-2xl font-bold font-heading text-brand-navy tracking-tight leading-none">
                Clientes
              </h1>
            </div>
            {data.canCreateCompany && (
              <NuevoClienteDropdown
                linkPrefix={linkPrefix}
                canOnboarding={data.canManageClientAccounts && data.canRequestDocumentation}
                onNuevoCliente={() => setCreatingCompany(true)}
              />
            )}
          </div>

          {/* Search + filters en una sola fila */}
          <div className="flex items-center gap-2 flex-wrap">
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
                className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal bg-white"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {/* Filtros como dropdown */}
            {data.departments.length > 1 && (
              <FilterDropdown
                label="Departamentos"
                options={data.departments.map((d) => ({ id: d.id, name: d.name }))}
                selected={selectedDepts}
                onToggle={toggleDept}
                onClear={() => setSelectedDepts([])}
              />
            )}

            {allServices.length > 1 && (
              <FilterDropdown
                label="Servicios"
                options={allServices}
                selected={selectedServices}
                onToggle={toggleService}
                onClear={() => setSelectedServices([])}
              />
            )}

            {hasAssignedCompanies && (
              <FilterPill
                label="Mis clientes"
                active={assignedOnly}
                onClick={() => setAssignedOnly((v) => !v)}
              />
            )}

            {/* Result count + clear: empujados a la derecha */}
            <div className="ml-auto flex items-center gap-3">
              <p className="text-sm text-text-muted">
                {search.trim() || hasFilters
                  ? `${filtered.filter((c) => !c.deleted_at).length} de ${activeCount}`
                  : `${activeCount} ${activeCount === 1 ? "cliente" : "clientes"}`}
              </p>
              {(hasFilters || search) && (
                <button
                  onClick={() => { setSearch(""); setSelectedDepts([]); setSelectedServices([]); setAssignedOnly(false); }}
                  className="text-xs text-text-muted hover:text-text-body cursor-pointer underline underline-offset-2"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="pt-4 pb-12">
          {companies.length === 0 ? (
            <p className="text-sm text-text-muted italic">Sin clientes</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-text-muted">Sin resultados para los filtros aplicados</p>
            </div>
          ) : (
            <div className="@container">
              <div className="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-4 gap-3">
                {filtered.map((c) =>
                  c.deleted_at ? (
                    <DeletedCompanyCard key={c.id} company={c} onClick={() => handleSelectCompany(c)} />
                  ) : (
                    <CompanyCard
                      key={c.id}
                      company={c}
                      deptNameById={deptNameById}
                      onClick={() => handleSelectCompany(c)}
                    />
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel — solo desktop, siempre solo lectura. La edición está en /clientes/[id]. */}
      {selectedCompany && isDesktop && (
        <ClientDetailPanel
          company={selectedCompany}
          linkPrefix={linkPrefix}
          canViewTaxModels={canViewTaxModels}
          onClose={() => setSelectedCompany(null)}
        />
      )}

      {/* Nueva empresa modal */}
      {creatingCompany && (
        <NewCompanyModal
          onClose={() => setCreatingCompany(false)}
          onCreate={async (input) => {
            const created = await createCompanyAdmin(input);
            handleCompanyCreated(created);
          }}
        />
      )}
    </div>
  );
}
