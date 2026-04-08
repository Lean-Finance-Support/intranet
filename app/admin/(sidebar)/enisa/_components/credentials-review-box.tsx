"use client";

import { useState } from "react";
import type { EnisaBoxData } from "@/lib/types/enisa";
import { validateBox, rejectBox } from "../actions";
import RejectionModal from "./rejection-modal";

interface CredentialsReviewBoxProps {
  box: EnisaBoxData;
  companyId: string;
  canEdit: boolean;
  onUpdate: () => Promise<void>;
}

export default function CredentialsReviewBox({ box, companyId, canEdit, onUpdate }: CredentialsReviewBoxProps) {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [validating, setValidating] = useState(false);

  const canReview = canEdit && box.status === "submitted" && box.credentials;

  async function handleValidate() {
    setValidating(true);
    try {
      await validateBox(companyId, box.typeKey);
      await onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setValidating(false);
    }
  }

  async function handleReject(comment: string) {
    await rejectBox(companyId, box.typeKey, comment);
    setShowRejectModal(false);
    await onUpdate();
  }

  return (
    <>
      <div className={`bg-white rounded-xl border ${statusBorderColor(box.status)} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-text-muted">{box.order}.</span>
              <h3 className="text-sm font-semibold text-brand-navy">{box.title}</h3>
            </div>
          </div>
          <StatusBadge status={box.status} />
        </div>

        {box.status === "rejected" && box.review?.rejection_comment && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-medium text-red-800 mb-0.5">Comentario de rechazo:</p>
            <p className="text-xs text-red-700">{box.review.rejection_comment}</p>
          </div>
        )}

        <div className="px-5 py-4">
          {box.credentials && (box.credentials.username || box.credentials.password) ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-muted w-20">Usuario:</span>
                <span className="text-xs text-text-body font-mono bg-gray-50 px-2 py-1 rounded">
                  {box.credentials.username || "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-muted w-20">Contraseña:</span>
                <span className="text-xs text-text-body font-mono bg-gray-50 px-2 py-1 rounded">
                  {box.credentials.password || "—"}
                </span>
              </div>
              {box.credentials.is_submitted && (
                <p className="text-[10px] text-blue-600 mt-1">Enviado por el cliente</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-muted italic">El cliente aún no ha proporcionado las credenciales</p>
          )}
        </div>

        {canReview && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
            <button
              onClick={handleValidate}
              disabled={validating}
              className="px-4 py-2 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {validating ? "Validando..." : "Validar"}
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              className="px-4 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
            >
              Rechazar
            </button>
          </div>
        )}
      </div>

      {showRejectModal && (
        <RejectionModal
          title={box.title}
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
        />
      )}
    </>
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
