"use client";

import { useState } from "react";
import type { EnisaBoxData } from "@/lib/types/enisa";
import { saveCredentials } from "../actions";

interface CredentialsBoxProps {
  box: EnisaBoxData;
  onUpdate: () => Promise<void>;
}

export default function CredentialsBox({ box, onUpdate }: CredentialsBoxProps) {
  const [username, setUsername] = useState(box.credentials?.username ?? "");
  const [password, setPassword] = useState(box.credentials?.password ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = box.status === "validated";
  const hasChanged =
    username !== (box.credentials?.username ?? "") ||
    password !== (box.credentials?.password ?? "");

  async function handleSave() {
    if (!username.trim() && !password.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await saveCredentials(username.trim(), password.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`bg-white rounded-xl border ${statusBorderColor(box.status)} overflow-hidden`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-text-muted">{box.order}.</span>
            <h3 className="text-sm font-semibold text-brand-navy">{box.title}</h3>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">{box.instructions}</p>
        </div>
        <StatusBadge status={box.status} />
      </div>

      {/* Rejection comment */}
      {box.status === "rejected" && box.review?.rejection_comment && (
        <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs font-medium text-red-800 mb-0.5">Motivo del rechazo:</p>
          <p className="text-xs text-red-700">{box.review.rejection_comment}</p>
        </div>
      )}

      {/* Credentials form */}
      <div className="px-5 py-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-body mb-1">
            Usuario / Email
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isReadOnly}
            placeholder="usuario@ejemplo.com"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal disabled:bg-gray-50 disabled:text-text-muted"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-body mb-1">
            Contraseña
          </label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isReadOnly}
            placeholder="Contraseña del portal ENISA"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal disabled:bg-gray-50 disabled:text-text-muted"
          />
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanged}
              className="px-4 py-2 text-xs font-medium text-white bg-brand-teal rounded-lg hover:bg-brand-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? "Guardando..." : saved ? "Guardado" : "Guardar credenciales"}
            </button>
            {box.credentials?.is_submitted && (
              <span className="text-[10px] text-blue-600">Enviado</span>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    draft: { label: "Pendiente", classes: "bg-gray-100 text-text-muted" },
    submitted: { label: "Enviado", classes: "bg-blue-100 text-blue-700" },
    validated: { label: "Validado", classes: "bg-green-100 text-green-700" },
    rejected: { label: "Rechazado", classes: "bg-red-100 text-red-700" },
  };
  const c = config[status] ?? config.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${c.classes}`}>
      {c.label}
    </span>
  );
}

function statusBorderColor(status: string) {
  switch (status) {
    case "validated": return "border-green-200";
    case "rejected": return "border-red-200";
    case "submitted": return "border-blue-200";
    default: return "border-gray-200";
  }
}
