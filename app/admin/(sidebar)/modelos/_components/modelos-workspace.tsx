"use client";

import { useState, useRef, useCallback } from "react";
import QuarterSelector from "./quarter-selector";
import ClientSearch from "./client-search";
import ModelsForm, { type ModelsFormHandle } from "./models-form";
import NotifyButton from "./notify-button";
import type { Company } from "@/lib/types/tax";

export default function ModelosWorkspace({ initialCompanyId }: { initialCompanyId?: string }) {
  const [quarter, setQuarter] = useState(1);
  const [company, setCompany] = useState<Company | null>(null);
  const [allAccepted, setAllAccepted] = useState(false);
  const [presented, setPresented] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const canEdit = company?.canEdit ?? true;
  const formRef = useRef<ModelsFormHandle>(null);

  const handleClientDataLoaded = useCallback((data: { allAccepted: boolean; submitted: boolean }) => {
    setAllAccepted(data.allAccepted);
  }, []);

  const handleNotified = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  const handleSelectCompany = useCallback((c: Company) => {
    setCompany(c);
    setPresented(false);
    setAllAccepted(false);
  }, []);

  const handleClearCompany = useCallback(() => {
    setCompany(null);
    setPresented(false);
    setAllAccepted(false);
  }, []);

  return (
    <div className="px-8">
      <div className="max-w-6xl mx-auto">
        <div className="sticky top-0 bg-surface-gray z-20 pt-12 pb-5 border-b border-gray-200 space-y-5">
          <h1 className="font-heading text-2xl text-brand-navy">
            Modelos de Prestación de Impuestos
          </h1>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Trimestre</label>
            <QuarterSelector selected={quarter} onChange={(q) => { setQuarter(q); setPresented(false); setAllAccepted(false); }} />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Empresa</label>
            <ClientSearch
              selected={company}
              initialCompanyId={initialCompanyId}
              onSelect={handleSelectCompany}
              onClear={handleClearCompany}
            />
          </div>

          {company && (
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-heading text-lg text-text-body">
                Modelos {quarter}T 2026 — {company.legal_name}
              </h3>
              <NotifyButton
                companyId={company.id}
                companyName={company.legal_name}
                quarter={quarter}
                canEdit={canEdit}
                allAccepted={allAccepted}
                presented={presented}
                onBeforeSend={() => formRef.current?.saveIfDirty() ?? Promise.resolve()}
                onNotified={handleNotified}
                onPresentationSent={() => setPresented(true)}
                onStatusLoaded={(p) => setPresented(p)}
              />
            </div>
          )}
        </div>

        {company && (
          <div className="pt-6 pb-12">
            <ModelsForm
              key={`${company.id}-${quarter}-${reloadKey}`}
              ref={formRef}
              companyId={company.id}
              quarter={quarter}
              canEdit={canEdit}
              presented={presented}
              onClientDataLoaded={handleClientDataLoaded}
            />
          </div>
        )}
      </div>
    </div>
  );
}
