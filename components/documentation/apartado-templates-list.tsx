"use client";

import { useState } from "react";
import type { ApartadoTemplateFile } from "@/lib/types/documentation";
import FileThumbnail from "./file-thumbnail";

interface Props {
  templates: ApartadoTemplateFile[];
  onDownload: (templateId: string) => Promise<string>;
  helperLabel?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ApartadoTemplatesList({
  templates,
  onDownload,
  helperLabel,
}: Props) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(id: string) {
    setDownloadingId(id);
    try {
      const url = await onDownload(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
          Plantillas para descargar
        </p>
        {helperLabel && (
          <span className="text-[11px] text-text-muted">{helperLabel}</span>
        )}
      </div>
      <div className="space-y-2">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5 hover:border-brand-teal/30 hover:shadow-sm transition-all"
          >
            <FileThumbnail size={32} label="PDF" tone="teal" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-body truncate">
                {tpl.file_name}
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Plantilla · {formatBytes(tpl.file_size)}
              </p>
            </div>
            <button
              onClick={() => handleDownload(tpl.id)}
              disabled={downloadingId === tpl.id}
              className="text-xs font-medium text-white px-3 py-1.5 rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5 bg-brand-teal flex-shrink-0"
            >
              <svg
                width={13}
                height={13}
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
              {downloadingId === tpl.id ? "..." : "Descargar"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
