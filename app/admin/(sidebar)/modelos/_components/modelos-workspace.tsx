"use client";

import { useState } from "react";
import QuarterSelector from "./quarter-selector";
import ClientSearch from "./client-search";
import ModelsForm from "./models-form";
import NotifyButton from "./notify-button";
import type { Company } from "@/lib/types/tax";

export default function ModelosWorkspace() {
  const [quarter, setQuarter] = useState(1);
  const [company, setCompany] = useState<Company | null>(null);
  const canEdit = company?.canEdit ?? true;

  return (
    <div className="space-y-6">
      {/* Selector de trimestre */}
      <div>
        <label className="block text-sm font-medium text-text-muted mb-2">Trimestre</label>
        <QuarterSelector selected={quarter} onChange={setQuarter} />
      </div>

      {/* Buscador de cliente */}
      <div>
        <label className="block text-sm font-medium text-text-muted mb-2">Empresa</label>
        <ClientSearch
          selected={company}
          onSelect={setCompany}
          onClear={() => setCompany(null)}
        />
      </div>

      {/* Tabla de modelos + botón notificar */}
      {company && (
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-lg text-text-body">
              Modelos {quarter}T 2026 — {company.legal_name}
            </h3>
            <NotifyButton
              companyId={company.id}
              companyName={company.legal_name}
              quarter={quarter}
              canEdit={canEdit}
            />
          </div>
          <ModelsForm
            key={`${company.id}-${quarter}`}
            companyId={company.id}
            quarter={quarter}
            canEdit={canEdit}
          />
        </div>
      )}

    </div>
  );
}
