"use client";

import { useState, useRef } from "react";
import type { EnisaBoxData } from "@/lib/types/enisa";
import { getUploadUrl, deleteDocument } from "../actions";

interface DocumentBoxProps {
  box: EnisaBoxData;
  onUpdate: () => Promise<void>;
}

export default function DocumentBox({ box, onUpdate }: DocumentBoxProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isReadOnly = box.status === "validated";
  const canUpload = !isReadOnly;
  const canDelete = (doc: { is_submitted: boolean }) => {
    if (isReadOnly) return false;
    if (box.status === "rejected") return true;
    if (doc.is_submitted) return false;
    return true;
  };

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const { uploadUrl, filePath } = await getUploadUrl(
          box.typeKey,
          file.name,
          file.size,
          file.type || "application/pdf"
        );

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/pdf" },
          body: file,
        });

        if (!uploadRes.ok) {
          // Clean up the DB record if upload failed
          throw new Error(`Error al subir ${file.name}`);
        }
      }
      await onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir archivo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(documentId: string) {
    setDeleting(documentId);
    setError(null);
    try {
      await deleteDocument(documentId);
      await onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar.");
    } finally {
      setDeleting(null);
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

      {/* Documents list */}
      {box.documents.length > 0 && (
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
                  {doc.is_submitted && (
                    <span className="ml-2 text-blue-600">Enviado</span>
                  )}
                </p>
              </div>
              {canDelete(doc) && (
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deleting === doc.id}
                  className="text-text-muted hover:text-red-500 transition-colors p-1 cursor-pointer disabled:opacity-50"
                  title="Eliminar"
                >
                  {deleting === doc.id ? (
                    <SpinnerIcon />
                  ) : (
                    <TrashIcon />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {canUpload && (
        <div className="px-5 py-4">
          <label
            className={`
              flex flex-col items-center justify-center py-6 px-4 border-2 border-dashed rounded-lg
              transition-colors cursor-pointer
              ${uploading
                ? "border-brand-teal/30 bg-brand-teal/5"
                : "border-gray-200 hover:border-brand-teal/50 hover:bg-gray-50"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              multiple
              onChange={handleFileSelect}
              disabled={uploading}
              className="sr-only"
            />
            {uploading ? (
              <>
                <SpinnerIcon className="w-6 h-6 text-brand-teal mb-2" />
                <span className="text-xs text-brand-teal font-medium">Subiendo...</span>
              </>
            ) : (
              <>
                <UploadIcon className="w-6 h-6 text-text-muted mb-2" />
                <span className="text-xs text-text-muted">
                  Haz clic o arrastra archivos aquí
                </span>
                <span className="text-[10px] text-text-muted mt-1">
                  PDF, DOC, JPG (máx. 10MB)
                </span>
              </>
            )}
          </label>
        </div>
      )}

      {error && (
        <div className="px-5 pb-4">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}
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

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-6 h-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? "w-4 h-4"}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
