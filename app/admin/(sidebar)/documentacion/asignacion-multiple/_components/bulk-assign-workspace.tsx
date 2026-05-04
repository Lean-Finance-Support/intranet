"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  BulkAssignmentData,
  BulkAssignmentEligibleAdmin,
  BulkAssignResult,
} from "../actions";
import { bulkAssign } from "../actions";
import { DOCUMENTATION_EMAIL_TEMPLATES } from "@/lib/documentation/email-templates";
import type { ApartadoTemplate, BlockTemplate } from "@/lib/types/documentation";

interface Props {
  data: BulkAssignmentData;
  linkPrefix: string;
}

export default function BulkAssignWorkspace({ data, linkPrefix }: Props) {
  const router = useRouter();
  const docCatalogHref = `${linkPrefix}/documentacion`;

  // Selección de apartados (id -> true). Bloques se reflejan automáticamente.
  const [selectedApartados, setSelectedApartados] = useState<Record<string, boolean>>({});

  // Selección de empresas
  const [selectedCompanies, setSelectedCompanies] = useState<Record<string, boolean>>({});
  const [companyQuery, setCompanyQuery] = useState("");

  // Supervisores por apartado: apartadoId -> profileIds[]
  const [supervisorsByApartado, setSupervisorsByApartado] = useState<Record<string, string[]>>({});

  // Envío de email por apartado (apartadoId -> bool); solo aplica a apartados con plantilla
  const [sendEmailByApartado, setSendEmailByApartado] = useState<Record<string, boolean>>({});

  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkAssignResult | null>(null);

  // ─── Derivaciones ────────────────────────────────────────────────────────
  const allApartados: ApartadoTemplate[] = useMemo(
    () => data.blocks.flatMap((b) => b.apartados),
    [data.blocks]
  );

  const blockById = useMemo(() => {
    const m = new Map<string, BlockTemplate>();
    for (const b of data.blocks) m.set(b.id, b);
    return m;
  }, [data.blocks]);

  const departmentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of data.departments) m.set(d.id, d.name);
    return m;
  }, [data.departments]);

  const selectedApartadoList = useMemo(
    () => allApartados.filter((a) => selectedApartados[a.id]),
    [allApartados, selectedApartados]
  );
  const selectedCompanyList = useMemo(
    () => data.companies.filter((c) => selectedCompanies[c.id]),
    [data.companies, selectedCompanies]
  );

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return data.companies;
    return data.companies.filter(
      (c) => c.name.toLowerCase().includes(q) || c.legal_name.toLowerCase().includes(q)
    );
  }, [companyQuery, data.companies]);

  // Apartados con plantilla de email asociada (entre los seleccionados)
  const apartadosWithEmail = useMemo(
    () => selectedApartadoList.filter((a) => !!a.email_template_slug),
    [selectedApartadoList]
  );

  const totalEmailsToSend = useMemo(() => {
    let n = 0;
    for (const a of apartadosWithEmail) {
      if (sendEmailByApartado[a.id]) n += selectedCompanyList.length;
    }
    return n;
  }, [apartadosWithEmail, sendEmailByApartado, selectedCompanyList]);

  const totalInstances = selectedApartadoList.length * selectedCompanyList.length;

  // Elegibilidad de supervisores por apartado
  function eligibleAdminsForApartado(a: ApartadoTemplate): BulkAssignmentEligibleAdmin[] {
    if (a.is_global) {
      // Cualquier admin que sea miembro de algún departamento
      return data.admins.filter((adm) => adm.department_ids.length > 0);
    }
    const apt = new Set(a.department_ids);
    return data.admins.filter((adm) => adm.department_ids.some((d) => apt.has(d)));
  }

  // ─── Handlers ────────────────────────────────────────────────────────────
  function toggleApartado(id: string) {
    setSelectedApartados((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
    // Si se deselecciona, limpiar supervisor + email
    setSupervisorsByApartado((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSendEmailByApartado((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function toggleBlock(blockId: string) {
    const block = blockById.get(blockId);
    if (!block) return;
    const allSelected = block.apartados.every((a) => selectedApartados[a.id]);
    setSelectedApartados((prev) => {
      const next = { ...prev };
      for (const a of block.apartados) {
        if (allSelected) delete next[a.id];
        else next[a.id] = true;
      }
      return next;
    });
    if (allSelected) {
      // limpiar supervisores + email para los apartados del bloque
      setSupervisorsByApartado((prev) => {
        const next = { ...prev };
        for (const a of block.apartados) delete next[a.id];
        return next;
      });
      setSendEmailByApartado((prev) => {
        const next = { ...prev };
        for (const a of block.apartados) delete next[a.id];
        return next;
      });
    }
  }

  function toggleCompany(id: string) {
    setSelectedCompanies((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }
  function selectAllVisibleCompanies() {
    setSelectedCompanies((prev) => {
      const next = { ...prev };
      for (const c of filteredCompanies) next[c.id] = true;
      return next;
    });
  }
  function clearAllCompanies() {
    setSelectedCompanies({});
  }

  function toggleSupervisor(apartadoId: string, profileId: string) {
    setSupervisorsByApartado((prev) => {
      const list = prev[apartadoId] ?? [];
      const exists = list.includes(profileId);
      const nextList = exists ? list.filter((id) => id !== profileId) : [...list, profileId];
      return { ...prev, [apartadoId]: nextList };
    });
  }

  function setSendEmail(apartadoId: string, value: boolean) {
    setSendEmailByApartado((prev) => ({ ...prev, [apartadoId]: value }));
  }

  // ─── Submit ──────────────────────────────────────────────────────────────
  const canSubmit =
    selectedApartadoList.length > 0 && selectedCompanyList.length > 0 && !submitting;

  function handleSubmit() {
    setError(null);
    startSubmit(async () => {
      try {
        const res = await bulkAssign({
          apartadoIds: selectedApartadoList.map((a) => a.id),
          companyIds: selectedCompanyList.map((c) => c.id),
          supervisorsByApartado,
          sendEmailByApartado,
        });
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado");
      }
    });
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="min-h-full px-8 py-12">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-8">
          <p className="text-brand-teal text-sm font-medium mb-2">Asignación múltiple</p>
          <h1 className="text-2xl font-bold font-heading text-brand-navy">
            Operación completada
          </h1>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <SummaryRow label="Apartados asignados" value={result.apartadoCount} />
            <SummaryRow label="Empresas afectadas" value={result.companyCount} />
            <SummaryRow label="Instancias creadas" value={result.instancesCreated} />
            <SummaryRow
              label="Instancias ya existían"
              value={result.instancesSkipped}
              muted
            />
            <SummaryRow label="Supervisores asignados" value={result.supervisorsAssigned} />
            <SummaryRow label="Emails enviados" value={result.emailsSent} />
          </div>
          {result.emailErrors.length > 0 && (
            <div className="mt-4 bg-red-50 border border-red-100 rounded-lg p-3 text-xs">
              <p className="font-medium text-red-700 mb-1">
                {result.emailErrors.length} error(es) al enviar emails
              </p>
              <ul className="list-disc pl-5 text-red-600 space-y-0.5">
                {result.emailErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-8 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setSelectedApartados({});
                setSelectedCompanies({});
                setSupervisorsByApartado({});
                setSendEmailByApartado({});
              }}
              className="text-sm text-text-muted hover:text-text-body px-3 py-2 rounded-lg cursor-pointer"
            >
              Nueva asignación
            </button>
            <Link
              href={docCatalogHref}
              className="text-sm bg-brand-teal text-white px-4 py-2 rounded-lg hover:opacity-90 cursor-pointer"
            >
              Volver al catálogo
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-8 py-12">
      <div className="max-w-5xl">
        {/* Header */}
        <Link
          href={docCatalogHref}
          className="text-xs text-text-muted hover:text-brand-teal inline-flex items-center gap-1 mb-3"
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver al catálogo
        </Link>
        <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
        <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
          Asignación múltiple
        </h1>
        <p className="text-text-muted text-sm mt-2 max-w-2xl">
          Selecciona uno o varios apartados (o bloques completos) y asígnalos a las empresas
          que elijas. Si algún apartado tiene plantilla de email asociada, podrás enviar el
          aviso al cliente desde la misma operación.
        </p>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Step 1: apartados/bloques */}
          <Section
            title="1. Apartados y bloques"
            subtitle={`${selectedApartadoList.length} apartado(s) seleccionado(s)`}
          >
            {data.blocks.length === 0 && (
              <p className="text-sm text-text-muted italic">
                El catálogo está vacío.
              </p>
            )}
            <div className="space-y-3">
              {data.blocks.map((block) => {
                if (block.apartados.length === 0) return null;
                const allSelected = block.apartados.every(
                  (a) => selectedApartados[a.id]
                );
                const someSelected = block.apartados.some(
                  (a) => selectedApartados[a.id]
                );
                return (
                  <div
                    key={block.id}
                    className="border border-gray-100 rounded-xl overflow-hidden"
                  >
                    <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected && !allSelected;
                        }}
                        onChange={() => toggleBlock(block.id)}
                      />
                      <span className="font-semibold text-sm text-brand-navy">
                        {block.name}
                      </span>
                      <span className="text-xs text-text-muted ml-auto">
                        {block.apartados.length} apartado(s)
                      </span>
                    </label>
                    <div className="divide-y divide-gray-100">
                      {block.apartados.map((a) => {
                        const deptNames = a.is_global
                          ? ["Global"]
                          : a.department_ids.map((d) => departmentNameById.get(d) ?? d);
                        return (
                          <label
                            key={a.id}
                            className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={!!selectedApartados[a.id]}
                              onChange={() => toggleApartado(a.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm text-text-body">{a.name}</span>
                                {deptNames.map((d) => (
                                  <span
                                    key={d}
                                    className={`inline-flex items-center text-[10px] font-medium px-2 py-[1px] rounded-full ${
                                      a.is_global
                                        ? "bg-brand-navy/10 text-brand-navy"
                                        : "bg-brand-teal/10 text-brand-teal"
                                    }`}
                                  >
                                    {d}
                                  </span>
                                ))}
                                {a.email_template_slug && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-[1px] rounded-full bg-amber-100 text-amber-700">
                                    <svg
                                      width={10}
                                      height={10}
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden
                                    >
                                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                      <polyline points="22,6 12,13 2,6" />
                                    </svg>
                                    Email asociado
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Step 2: empresas */}
          <Section
            title="2. Empresas destinatarias"
            subtitle={`${selectedCompanyList.length} de ${data.companies.length} seleccionadas`}
          >
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                placeholder="Buscar empresa..."
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
              />
              <button
                type="button"
                onClick={selectAllVisibleCompanies}
                className="text-xs text-brand-teal hover:bg-brand-teal/10 px-2.5 py-1.5 rounded-md cursor-pointer whitespace-nowrap"
              >
                Marcar visibles
              </button>
              {selectedCompanyList.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllCompanies}
                  className="text-xs text-text-muted hover:bg-gray-100 px-2.5 py-1.5 rounded-md cursor-pointer whitespace-nowrap"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
              {filteredCompanies.length === 0 && (
                <p className="text-sm text-text-muted italic px-3 py-3">
                  Sin coincidencias.
                </p>
              )}
              {filteredCompanies.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={!!selectedCompanies[c.id]}
                    onChange={() => toggleCompany(c.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-body truncate">{c.name}</p>
                    {c.name !== c.legal_name && (
                      <p className="text-[11px] text-text-muted truncate">{c.legal_name}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </Section>
        </div>

        {/* Step 3: supervisores por apartado */}
        {selectedApartadoList.length > 0 && (
          <Section
            title="3. Supervisores por apartado"
            subtitle="Solo verás admins elegibles según el departamento del apartado. Es opcional."
            className="mt-6"
          >
            <div className="space-y-3">
              {selectedApartadoList.map((a) => {
                const eligibles = eligibleAdminsForApartado(a);
                const selected = supervisorsByApartado[a.id] ?? [];
                const blockName = blockById.get(a.block_id)?.name ?? "";
                return (
                  <div key={a.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-brand-navy truncate">
                          {a.name}
                        </p>
                        <p className="text-xs text-text-muted">
                          {blockName}
                          {" · "}
                          {a.is_global
                            ? "Global"
                            : a.department_ids
                                .map((d) => departmentNameById.get(d) ?? d)
                                .join(", ")}
                        </p>
                      </div>
                      <span className="text-[11px] text-text-muted whitespace-nowrap">
                        {selected.length} / {eligibles.length} elegibles
                      </span>
                    </div>
                    {eligibles.length === 0 ? (
                      <p className="text-xs text-text-muted/80 italic">
                        Ningún admin es elegible para este apartado. Asigna supervisores
                        después de crear las instancias.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {eligibles.map((adm) => {
                          const checked = selected.includes(adm.id);
                          return (
                            <label
                              key={adm.id}
                              className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                                checked
                                  ? "bg-brand-teal/10 text-brand-teal"
                                  : "hover:bg-gray-50 text-text-body"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSupervisor(a.id, adm.id)}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate">
                                  {adm.full_name ?? adm.email}
                                </p>
                                {adm.full_name && (
                                  <p className="text-[10px] text-text-muted truncate">
                                    {adm.email}
                                  </p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Step 4: emails (auto, solo si hay apartados con plantilla) */}
        {apartadosWithEmail.length > 0 && (
          <Section
            title="4. Emails a enviar"
            subtitle="Marca para disparar el email asociado al asignar."
            className="mt-6"
          >
            <div className="space-y-2">
              {apartadosWithEmail.map((a) => {
                const tpl = DOCUMENTATION_EMAIL_TEMPLATES.find(
                  (t) => t.slug === a.email_template_slug
                );
                const checked = !!sendEmailByApartado[a.id];
                return (
                  <label
                    key={a.id}
                    className="flex items-start gap-3 border border-gray-100 rounded-xl px-3 py-3 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setSendEmail(a.id, e.target.checked)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-brand-navy">
                        {a.name}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        Plantilla:{" "}
                        <span className="font-medium text-text-body">
                          {tpl?.name ?? a.email_template_slug}
                        </span>
                      </p>
                      {tpl?.description && (
                        <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
                          {tpl.description}
                        </p>
                      )}
                      {checked && selectedCompanyList.length > 0 && (
                        <p className="text-[11px] text-brand-teal mt-1">
                          Se enviarán {selectedCompanyList.length} email(s) (uno por
                          empresa, a sus contactos cliente).
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </Section>
        )}

        {/* Submit */}
        <div className="mt-8 flex items-center justify-between gap-4 border-t border-gray-100 pt-6">
          <div className="text-sm text-text-muted">
            {totalInstances === 0 ? (
              "Selecciona apartados y empresas para continuar."
            ) : (
              <>
                <span className="font-semibold text-brand-navy">
                  {totalInstances}
                </span>{" "}
                instancia(s) se crearán
                {totalEmailsToSend > 0 && (
                  <>
                    {" "}+{" "}
                    <span className="font-semibold text-brand-navy">
                      {totalEmailsToSend}
                    </span>{" "}
                    email(s) se enviarán
                  </>
                )}
                .
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(docCatalogHref)}
              className="text-sm text-text-muted hover:text-text-body px-3 py-2 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="text-sm bg-brand-teal text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? "Procesando..." : "Asignar y notificar"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${className ?? ""}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <h2 className="text-base font-semibold text-brand-navy font-heading">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-3 py-2 ${
        muted ? "bg-gray-50 text-text-muted" : "bg-brand-teal/5 text-brand-navy"
      }`}
    >
      <span className="text-xs">{label}</span>
      <span className="text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
}
