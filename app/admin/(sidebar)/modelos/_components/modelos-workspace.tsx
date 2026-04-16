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
  const [notifiedAt, setNotifiedAt] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const canEdit = company?.canEdit ?? true;
  const formRef = useRef<ModelsFormHandle>(null);

  const handleClientDataLoaded = useCallback((data: { allAccepted: boolean; submitted: boolean; notifiedAt: string | null; presented: boolean }) => {
    setAllAccepted(data.allAccepted);
    setPresented(data.presented);
    setNotifiedAt(data.notifiedAt);
    setDataReady(true);
  }, []);

  const handleNotified = useCallback((newNotifiedAt?: string) => {
    setNotifiedAt(newNotifiedAt ?? new Date().toISOString());
    setReloadKey((k) => k + 1);
  }, []);

  const handleSelectCompany = useCallback((c: Company) => {
    setCompany(c);
    setPresented(false);
    setAllAccepted(false);
    setNotifiedAt(null);
    setDataReady(false);
  }, []);

  const handleClearCompany = useCallback(() => {
    setCompany(null);
    setPresented(false);
    setAllAccepted(false);
    setNotifiedAt(null);
    setDataReady(false);
  }, []);

  return (
    <div className="px-8">
      <div className="max-w-6xl mx-auto">
        <div className="sticky top-0 bg-surface-gray z-20 pt-6 pb-4 border-b border-gray-200 space-y-4">
          {/* Fila 1: título + selector de trimestre */}
          <div className="flex items-center justify-between gap-4">
            <h1 className="font-heading text-2xl text-brand-navy leading-tight">
              Modelos de Prestación de Impuestos
            </h1>
            <QuarterSelector selected={quarter} onChange={(q) => { setQuarter(q); setPresented(false); setAllAccepted(false); setNotifiedAt(null); setDataReady(false); }} />
          </div>

          {/* Fila 2: buscador de empresa + botones (si hay empresa seleccionada) */}
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <ClientSearch
                selected={company}
                initialCompanyId={initialCompanyId}
                onSelect={handleSelectCompany}
                onClear={handleClearCompany}
              />
            </div>
            {company && (
              <NotifyButton
                key={`${company.id}-${quarter}`}
                companyId={company.id}
                companyName={company.legal_name}
                quarter={quarter}
                canEdit={canEdit}
                allAccepted={allAccepted}
                presented={presented}
                loading={!dataReady}
                initialNotifiedAt={notifiedAt}
                onBeforeSend={() => formRef.current?.saveIfDirty() ?? Promise.resolve()}
                onNotified={handleNotified}
                onPresentationSent={() => setPresented(true)}
              />
            )}
          </div>
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
