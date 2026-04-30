"use client";

import { useEffect, useRef, useState } from "react";
import type { ApartadoFile } from "@/lib/types/documentation";
import ConfirmDialog from "@/components/confirm-dialog";
import FileThumbnail, { fileExt } from "./file-thumbnail";

interface Props {
  files: ApartadoFile[];
  canUpload: boolean;
  canDeleteOwn: boolean;
  canDeleteAll?: boolean;
  ownerId?: string;
  onUpload: (file: File) => Promise<void>;
  onDelete?: (fileId: string) => Promise<void>;
  onDownload: (fileId: string) => Promise<string>;
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
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const seenFileIdsRef = useRef<Set<string>>(new Set(files.map((f) => f.id)));

  useEffect(() => {
    setDeletingIds((prev) => {
      if (prev.size === 0) return prev;
      const currentIds = new Set(files.map((f) => f.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [files]);

  // Reconcilia ghosts optimistas con archivos reales tras router.refresh.
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

  async function handleDownloadAll() {
    setError(null);
    setDownloadingAll(true);
    try {
      for (const f of visibleFiles) {
        const url = await onDownload(f.id);
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.download = f.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // pequeña espera para que el navegador no bloquee descargas en lote
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al descargar");
    } finally {
      setDownloadingAll(false);
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
  const totalCount = visibleFiles.length + uploadingFiles.length;

  function openPicker() {
    if (!canUpload || uploading) return;
    inputRef.current?.click();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!canUpload) return;
    handleFiles(e.dataTransfer.files);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
          Archivos adjuntos
          <span className="ml-1.5 text-text-muted/80 font-normal normal-case tracking-normal">
            · {totalCount}
          </span>
        </p>
        {visibleFiles.length > 1 && (
          <button
            onClick={handleDownloadAll}
            disabled={downloadingAll}
            className="text-[11px] text-text-muted hover:text-text-body cursor-pointer underline underline-offset-2 disabled:opacity-50"
            title="Descargar todos los archivos adjuntos"
          >
            {downloadingAll ? "Descargando…" : "Descargar todo"}
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

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {isEmpty ? (
        <DropZone
          enabled={canUpload}
          dragOver={dragOver}
          onDragOver={(e) => {
            e.preventDefault();
            if (canUpload) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={openPicker}
        />
      ) : (
        <div className="space-y-2">
          {visibleFiles.map((f) => {
            const isMine = ownerId && f.uploaded_by === ownerId;
            const canRemove =
              !!onDelete && (canDeleteAll || (canDeleteOwn && isMine));
            return (
              <div
                key={f.id}
                className="group flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5 hover:border-brand-teal/30 hover:shadow-sm transition-all"
              >
                <FileThumbnail size={36} label={fileExt(f.file_name)} tone="navy" />
                <button
                  onClick={() => handleDownload(f.id)}
                  className="flex-1 min-w-0 text-left cursor-pointer"
                >
                  <p className="text-sm font-medium text-text-body truncate hover:text-brand-teal transition-colors">
                    {f.file_name}
                  </p>
                  <p className="text-[11px] text-text-muted mt-0.5 truncate">
                    {formatBytes(f.file_size)} · {formatDateShort(f.uploaded_at)}
                    {f.uploaded_by_name && (
                      <>
                        {" · "}
                        <span className="text-text-body">{f.uploaded_by_name}</span>
                      </>
                    )}
                  </p>
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDownload(f.id)}
                    className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-text-muted hover:text-brand-teal cursor-pointer"
                    title="Descargar"
                    aria-label="Descargar"
                  >
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1={12} y1={15} x2={12} y2={3} />
                    </svg>
                  </button>
                  {canRemove && (
                    <button
                      onClick={() => setPendingDeleteId(f.id)}
                      className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-text-muted hover:text-red-500 cursor-pointer"
                      title="Eliminar"
                      aria-label="Eliminar"
                    >
                      <svg
                        width={15}
                        height={15}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {uploadingFiles.map((ghost) => (
            <div
              key={ghost.tempId}
              className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5 opacity-60"
            >
              <FileThumbnail size={36} label={fileExt(ghost.name)} tone="neutral" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-body truncate">{ghost.name}</p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {formatBytes(ghost.size)} · Subiendo…
                </p>
              </div>
              <svg
                className="w-4 h-4 text-text-muted flex-shrink-0 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={2} strokeOpacity={0.25} />
                <path
                  d="M22 12a10 10 0 0 1-10 10"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </div>
          ))}
          {canUpload && (
            <div className="pt-1">
              <DropZone
                enabled={canUpload}
                dragOver={dragOver}
                compact
                onDragOver={(e) => {
                  e.preventDefault();
                  if (canUpload) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={openPicker}
              />
            </div>
          )}
        </div>
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
    </section>
  );
}

function DropZone({
  enabled,
  dragOver,
  compact,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  enabled: boolean;
  dragOver: boolean;
  compact?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  const cls = `rounded-2xl border-2 border-dashed transition-colors text-center group ${
    enabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"
  } ${
    dragOver
      ? "border-brand-teal bg-brand-teal/5"
      : "border-gray-200 bg-gray-50/50 hover:border-brand-teal/50 hover:bg-brand-teal/5"
  } ${compact ? "px-4 py-4" : "px-6 py-8"}`;
  return (
    <div
      role="button"
      tabIndex={enabled ? 0 : -1}
      className={cls}
      onClick={enabled ? onClick : undefined}
      onKeyDown={(e) => {
        if (!enabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-white border border-gray-200 group-hover:border-brand-teal/40 flex items-center justify-center text-text-muted group-hover:text-brand-teal transition-colors">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <p className="text-sm text-text-body font-medium">
          Arrastra archivos aquí{" "}
          <span className="text-text-muted font-normal">
            o haz clic para seleccionar
          </span>
        </p>
        {!compact && (
          <p className="text-[11px] text-text-muted">
            PDF, JPG, PNG · máx 25 MB por archivo
          </p>
        )}
      </div>
    </div>
  );
}
