"use client";

import { useState } from "react";
import { addBankAccount } from "../actions";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";

interface AddBankAccountModalProps {
  onClose: () => void;
  onAdded: (account: CompanyBankAccount) => void;
}

export default function AddBankAccountModal({ onClose, onAdded }: AddBankAccountModalProps) {
  const [iban, setIban] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanIban = iban.replace(/\s/g, "").toUpperCase();
    if (cleanIban.length < 15) {
      setError("El IBAN debe tener al menos 15 caracteres");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const account = await addBankAccount(cleanIban, label || null, null);
      onAdded(account);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al añadir cuenta";
      if (message.includes("duplicate")) {
        setError("Este IBAN ya está registrado");
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h3 className="font-heading text-lg text-brand-navy mb-4">
          Nueva cuenta bancaria
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">
              IBAN
            </label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="ES00 0000 0000 0000 0000 0000"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">
              Etiqueta (opcional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Cuenta principal, Cuenta nóminas..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-text-body text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-brand-teal text-white rounded-lg text-sm font-medium hover:bg-brand-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Añadiendo..." : "Añadir"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
