"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveCompany } from "./actions";
import type { CompanyOption } from "./actions";

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}

export default function CompanySelector({ companies, linkPrefix = "/app" }: { companies: CompanyOption[]; linkPrefix?: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSelect(companyId: string) {
    startTransition(async () => {
      await setActiveCompany(companyId);
      router.push(`${linkPrefix}/dashboard`);
    });
  }

  return (
    <div className="space-y-3">
      {companies.map((company) => (
        <button
          key={company.id}
          onClick={() => handleSelect(company.id)}
          disabled={isPending}
          className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-brand-teal hover:shadow-md transition-all duration-150 text-left cursor-pointer disabled:opacity-50 disabled:cursor-wait"
        >
          <div className="w-10 h-10 rounded-lg bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
            <BuildingIcon className="w-5 h-5 text-brand-teal" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand-navy truncate">
              {company.company_name || company.legal_name}
            </p>
            {company.company_name && (
              <p className="text-xs text-text-muted truncate">
                {company.legal_name}
              </p>
            )}
          </div>
          <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ))}
    </div>
  );
}
