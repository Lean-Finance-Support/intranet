"use client";

import { useState } from "react";
import type { EnisaCompany } from "../actions";
import ClientSearch from "./client-search";
import CompanyEnisaView from "./company-enisa-view";

export default function EnisaAdminWorkspace({ initialCompanyId }: { initialCompanyId?: string }) {
  const [selectedCompany, setSelectedCompany] = useState<EnisaCompany | null>(null);

  return (
    <div className="space-y-6">
      <ClientSearch
        selected={selectedCompany}
        onSelect={setSelectedCompany}
        onClear={() => setSelectedCompany(null)}
        initialCompanyId={initialCompanyId}
      />

      {selectedCompany && (
        <CompanyEnisaView company={selectedCompany} />
      )}
    </div>
  );
}
