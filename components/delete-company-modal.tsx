"use client";

import { useEffect, useState } from "react";

interface DeleteCompanyModalProps {
  legalName: string;
  nif: string;
  onConfirm: (typedNif: string) => Promise<void>;
  onCancel: () => void;
}

export default function DeleteCompanyModal({ legalName, nif, onConfirm, onCancel }: DeleteCompanyModalProps) {
  const [typed, setTyped] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirming) onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel, confirming]);

  const matches = typed.trim().toUpperCase() === nif.trim().toUpperCase();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setConfirming(true);
    setError("");
    try {
      await onConfirm(typed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al dar de baja");
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !confirming && onCancel()} />
      <form onSubmit={handleSubmit} className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold font-heading text-brand-navy">Dar de baja a cliente</h2>
          <p className="text-sm text-text-muted mt-2">
            Vas a dar de baja a <span className="font-semibold text-text-body">{legalName}</span>. El cliente
            desaparecerá de los listados pero el histórico fiscal se conservará.
            Podrás restaurarlo desde la papelera.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            Para confirmar, escribe el NIF: <span className="font-mono text-text-body">{nif}</span>
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            autoFocus
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 font-mono"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="text-sm text-text-muted hover:text-text-body px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!matches || confirming}
            className="text-sm bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {confirming ? "Dando de baja..." : "Dar de baja"}
          </button>
        </div>
      </form>
    </div>
  );
}
