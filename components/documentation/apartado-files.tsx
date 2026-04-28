"use client";

import { useRef, useState } from "react";
import type { ApartadoFile } from "@/lib/types/documentation";

interface Props {
  files: ApartadoFile[];
  canUpload: boolean;
  canDeleteOwn: boolean;
  ownerId?: string;
  onUpload: (file: File) => Promise<void>;
  onDelete?: (fileId: string) => Promise<void>;
  onDownload: (fileId: string) => Promise<string>;
  emptyText?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default function ApartadoFiles({
  files,
  canUpload,
  canDeleteOwn,
  ownerId,
  onUpload,
  onDelete,
  onDownload,
  emptyText = "Sin archivos",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        await onUpload(file);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDownload(fileId: string) {
    try {
      const url = await onDownload(fileId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al descargar");
    }
  }

  async function handleDelete(fileId: string) {
    if (!onDelete) return;
    if (!confirm("¿Eliminar este archivo?")) return;
    try {
      await onDelete(fileId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Archivos
        </p>
        {canUpload && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {uploading ? "Subiendo..." : "Añadir archivo"}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {files.length === 0 ? (
        <p className="text-xs text-text-muted italic">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => {
            const isMine = ownerId && f.uploaded_by === ownerId;
            return (
              <li
                key={f.id}
                className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 group"
              >
                <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <button
                  onClick={() => handleDownload(f.id)}
                  className="flex-1 min-w-0 text-left cursor-pointer"
                >
                  <p className="text-sm font-medium text-text-body truncate hover:text-brand-teal transition-colors">
                    {f.file_name}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    {formatBytes(f.file_size)} · {formatDateShort(f.uploaded_at)}
                    {f.uploaded_by_name ? ` · ${f.uploaded_by_name}` : ""}
                  </p>
                </button>
                {canDeleteOwn && isMine && onDelete && (
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Eliminar"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
