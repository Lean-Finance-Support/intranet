"use client";

import { useState } from "react";
import type { EnisaBoxData } from "@/lib/types/enisa";
import { validateBox, rejectBox, getDownloadUrl } from "../actions";
import RejectionModal from "./rejection-modal";

interface DocumentReviewBoxProps {
  box: EnisaBoxData;
  companyId: string;
  canEdit: boolean;
  onUpdate: () => Promise<void>;
}

export default function DocumentReviewBox({ box, companyId, canEdit, onUpdate }: DocumentReviewBoxProps) {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [validating, setValidating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const canReview = canEdit && box.status === "submitted" && box.documents.length > 0;

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

  async function handleDownload(docId: string, fileName: string) {
    setDownloading(docId);
    try {
      const url = await getDownloadUrl(companyId, docId);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <div className={`bg-white rounded-xl border ${statusBorderColor(box.status)} overflow-hidden`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-text-muted">{box.order}.</span>
              <h3 className="text-sm font-semibold text-brand-navy">{box.title}</h3>
            </div>
          </div>
          <StatusBadge status={box.status} />
        </div>

        {/* Rejection comment */}
        {box.status === "rejected" && box.review?.rejection_comment && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-medium text-red-800 mb-0.5">Comentario de rechazo:</p>
            <p className="text-xs text-red-700">{box.review.rejection_comment}</p>
          </div>
        )}

        {/* Documents list */}
        {box.documents.length > 0 ? (
          <div className="px-5 py-3 space-y-2">
            {box.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg"
              >
                <FileIcon />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-body truncate">{doc.file_name}</p>
                  <p className="text-[10px] text-text-muted">
                    {formatFileSize(doc.file_size)}
                    {doc.is_submitted && <span className="ml-2 text-blue-600">Enviado</span>}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(doc.id, doc.file_name)}
                  disabled={downloading === doc.id}
                  className="text-brand-teal hover:text-brand-teal/80 transition-colors p-1 cursor-pointer disabled:opacity-50"
                  title="Descargar"
                >
                  {downloading === doc.id ? <SpinnerIcon /> : <DownloadIcon />}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-4">
            <p className="text-xs text-text-muted italic">Sin documentos adjuntados</p>
          </div>
        )}

        {/* Actions */}
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon() {
  return (
    <svg className="w-4 h-4 text-brand-teal flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
