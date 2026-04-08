"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { getAllEnisaCompanies } from "../actions";
import type { EnisaCompany } from "../actions";

interface ClientSearchProps {
  selected: EnisaCompany | null;
  onSelect: (company: EnisaCompany) => void;
  onClear: () => void;
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-brand-teal/15 text-brand-teal rounded px-0.5 not-italic font-medium">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

export default function ClientSearch({ selected, onSelect, onClear }: ClientSearchProps) {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<EnisaCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    getAllEnisaCompanies()
      .then(setCompanies)
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false));
  }, []);

  const myCount = companies.filter((c) => c.isAssigned).length;
  const showToggle = myCount > 0;

  const filtered = useMemo(() => {
    let list = onlyMine ? companies.filter((c) => c.isAssigned) : companies;
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (c) =>
        c.legal_name.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q) ||
        c.nif?.toLowerCase().includes(q)
    );
  }, [companies, query, onlyMine]);

  if (selected) {
    return (
      <div className="flex items-center gap-3 bg-brand-teal/5 border border-brand-teal/20 rounded-lg px-4 py-3">
        <div className="w-9 h-9 bg-brand-teal/10 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-brand-teal font-bold text-sm">
            {selected.legal_name[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-body truncate">{selected.legal_name}</p>
          {(selected.company_name || selected.nif) && (
            <p className="text-sm text-text-muted truncate">
              {[selected.company_name, selected.nif ? `NIF: ${selected.nif}` : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button onClick={onClear} className="text-sm text-brand-teal hover:underline flex-shrink-0 cursor-pointer">
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, nombre comercial o NIF..."
            className="w-full pl-9 pr-4 py-3 rounded-lg border border-gray-200 text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal"
          />
        </div>
        {!loading && showToggle && (
          <button
            onClick={() => setOnlyMine((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer ${
              onlyMine
                ? "bg-brand-teal text-white border-brand-teal"
                : "bg-white text-text-muted border-gray-200 hover:border-brand-teal hover:text-brand-teal"
            }`}
          >
            {onlyMine ? `Mis empresas (${myCount})` : "Solo mis empresas"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-36 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-text-muted text-sm py-6">
          {query ? "Sin resultados" : "No hay empresas con este servicio"}
        </p>
      ) : (
        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-auto">
          {filtered.map((company) => (
            <li key={company.id}>
              <button
                onClick={() => onSelect(company)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 cursor-pointer"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${company.isAssigned ? "bg-brand-teal/10" : "bg-gray-100"}`}>
                  <span className={`text-xs font-bold ${company.isAssigned ? "text-brand-teal" : "text-text-muted"}`}>
                    {company.legal_name[0].toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-medium text-sm text-text-body truncate">
                      {highlight(company.legal_name, query)}
                    </p>
                    {company.isAssigned && (
                      <span className="flex-shrink-0 text-[10px] font-semibold text-brand-teal bg-brand-teal/10 rounded-full px-1.5 py-0.5">
                        Asignada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted truncate">
                    {highlight([company.company_name, company.nif].filter(Boolean).join(" · "), query)}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
