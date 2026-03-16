"use client";

import { useState, useEffect, useMemo } from "react";
import { getAllCompanies } from "../actions";
import type { Company } from "@/lib/types/tax";

interface ClientSearchProps {
  selected: Company | null;
  onSelect: (company: Company) => void;
  onClear: () => void;
}

export default function ClientSearch({ selected, onSelect, onClear }: ClientSearchProps) {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllCompanies()
      .then(setCompanies)
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return companies;
    const q = query.toLowerCase();
    return companies.filter(
      (c) =>
        c.company_name?.toLowerCase().includes(q) ||
        c.nif?.toLowerCase().includes(q)
    );
  }, [companies, query]);

  if (selected) {
    return (
      <div className="flex items-center gap-3 bg-brand-teal/5 border border-brand-teal/20 rounded-lg px-4 py-3">
        <div className="w-9 h-9 bg-brand-teal/10 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-brand-teal font-bold text-sm">
            {(selected.company_name?.[0] ?? "E").toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-body truncate">
            {selected.company_name ?? "Sin nombre"}
          </p>
          {selected.nif && (
            <p className="text-sm text-text-muted">NIF: {selected.nif}</p>
          )}
        </div>
        <button
          onClick={onClear}
          className="text-sm text-brand-teal hover:underline flex-shrink-0"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar empresa por nombre o NIF..."
        className="w-full px-4 py-3 mb-3 rounded-lg border border-gray-200 text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal"
      />

      {/* Company list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-text-muted text-sm py-6">
          {query ? "Sin resultados" : "No hay empresas registradas"}
        </p>
      ) : (
        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-auto">
          {filtered.map((company) => (
            <li key={company.id}>
              <button
                onClick={() => onSelect(company)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-text-muted text-xs font-bold">
                    {(company.company_name?.[0] ?? "E").toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-text-body truncate">
                    {company.company_name ?? "Sin nombre"}
                  </p>
                  {company.nif && (
                    <p className="text-xs text-text-muted">{company.nif}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
