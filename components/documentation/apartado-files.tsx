"use client";

import { useEffect, useRef, useState } from "react";
import type { ApartadoFile } from "@/lib/types/documentation";
import ConfirmDialog from "@/components/confirm-dialog";

interface Props {
  files: ApartadoFile[];
  canUpload: boolean;
  canDeleteOwn: boolean;
  canDeleteAll?: boolean;
  ownerId?: string;
  onUpload: (file: File) => Promise<void>;
  onDelete?: (fileId: string) => Promise<void>;
  onDownload: (fileId: string) => Promise<string>;
  emptyText?: string;
}

interface UploadingFile {
  tempId: string;
  name: string;
  size: number;
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
  canDeleteAll,
  ownerId,
  onUpload,
  onDelete,
  onDownload,
  emptyText = "Sin archivos",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const seenFileIdsRef = useRef<Set<string>>(new Set(files.map((f) => f.id)));

  useEffect(() => {
    setDeletingIds((prev) => {
      if (prev.size === 0) return prev;
      const currentIds = new Set(files.map((f) => f.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (currentIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [files]);

  // Reconcilia ghosts optimistas con los archivos reales que llegan tras router.refresh.
  // Los IDs nuevos (no vistos antes) se interpretan como uploads completados; si su
  // nombre+tamaño coincide con un ghost, eliminamos ese ghost. Así evitamos el frame
  // en blanco entre que el ghost desaparece y la lista nueva se pinta.
  useEffect(() => {
    const seen = seenFileIdsRef.current;
    const newFiles: ApartadoFile[] = [];
    for (const f of files) {
      if (!seen.has(f.id)) newFiles.push(f);
    }
    if (newFiles.length === 0) {
      seenFileIdsRef.current = new Set(files.map((f) => f.id));
      return;
    }
    setUploadingFiles((prev) => {
      if (prev.length === 0) {
        seenFileIdsRef.current = new Set(files.map((f) => f.id));
        return prev;
      }
      const remaining = [...prev];
      for (const nf of newFiles) {
        const idx = remaining.findIndex(
          (g) => g.name === nf.file_name && g.size === nf.file_size
        );
        if (idx >= 0) remaining.splice(idx, 1);
      }
      seenFileIdsRef.current = new Set(files.map((f) => f.id));
      return remaining.length === prev.length ? prev : remaining;
    });
  }, [files]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setUploadingFiles((prev) => [...prev, { tempId, name: file.name, size: file.size }]);
        try {
          await onUpload(file);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Error al subir");
          setUploadingFiles((prev) => prev.filter((u) => u.tempId !== tempId));
        }
      }
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

  async function handleConfirmDelete() {
    const id = pendingDeleteId;
    if (!id || !onDelete) return;
    setPendingDeleteId(null);
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      await onDelete(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const visibleFiles = files.filter((f) => !deletingIds.has(f.id));
  const isEmpty = visibleFiles.length === 0 && uploadingFiles.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Archivos adjuntos
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

      {isEmpty ? (
        <p className="text-xs text-text-muted italic">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {visibleFiles.map((f) => {
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
                {(canDeleteAll || (canDeleteOwn && isMine)) && onDelete && (
                  <button
                    onClick={() => setPendingDeleteId(f.id)}
                    className="text-text-muted hover:text-red-500 transition-colors cursor-pointer"
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
          {uploadingFiles.map((ghost) => (
            <li
              key={ghost.tempId}
              className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 opacity-60"
            >
              <svg
                className="w-4 h-4 text-text-muted flex-shrink-0 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeOpacity={0.25}
                />
                <path
                  d="M22 12a10 10 0 0 1-10 10"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-body truncate">{ghost.name}</p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {formatBytes(ghost.size)} · Subiendo...
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pendingDeleteId && onDelete && (
        <ConfirmDialog
          title="Eliminar archivo"
          message="¿Eliminar este archivo?"
          confirmLabel="Eliminar"
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
