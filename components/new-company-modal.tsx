"use client";

import { useEffect, useState } from "react";
import type { CreateCompanyInput } from "@/app/admin/clientes/actions";

interface NewCompanyModalProps {
  onClose: () => void;
  onCreate: (input: CreateCompanyInput) => Promise<void>;
}

export default function NewCompanyModal({ onClose, onCreate }: NewCompanyModalProps) {
  const [legalName, setLegalName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [nif, setNif] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, saving]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!legalName.trim() || !companyName.trim() || !nif.trim()) {
      setError("Razón social, nombre comercial y NIF/CIF son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate({
        legal_name: legalName,
        company_name: companyName,
        nif: nif,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el cliente.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold font-heading text-brand-navy">Nuevo cliente</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Todos los campos son obligatorios.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Razón social <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              required
              autoFocus
              placeholder="Ej: Acme Servicios SL"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Nombre comercial <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              placeholder="Ej: Acme"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              NIF / CIF <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nif}
              onChange={(e) => setNif(e.target.value.toUpperCase())}
              required
              placeholder="Ej: B12345678"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal font-mono"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-sm text-text-muted hover:text-text-body px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="text-sm bg-brand-teal text-white px-4 py-2 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Creando..." : "Crear cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}
