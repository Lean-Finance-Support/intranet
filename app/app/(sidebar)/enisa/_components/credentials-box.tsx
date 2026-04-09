"use client";

import type { EnisaBoxData } from "@/lib/types/enisa";
import LinkifyText from "./linkify-text";

interface CredentialsBoxProps {
  box: EnisaBoxData;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}

export default function CredentialsBox({
  box,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
}: CredentialsBoxProps) {
  const isReadOnly = box.status === "validated";

  return (
    <div className={`bg-white rounded-xl border ${statusBorderColor(box.status)} overflow-hidden`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-text-muted">{box.order}.</span>
            <h3 className="text-sm font-semibold text-brand-navy">{box.title}</h3>
          </div>
          <LinkifyText text={box.instructions} className="text-xs text-text-muted leading-relaxed" />
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
            onChange={(e) => onUsernameChange(e.target.value)}
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
            onChange={(e) => onPasswordChange(e.target.value)}
            disabled={isReadOnly}
            placeholder="Contraseña del portal ENISA"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal disabled:bg-gray-50 disabled:text-text-muted"
          />
        </div>
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
