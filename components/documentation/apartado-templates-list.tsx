"use client";

import { useState } from "react";
import type { ApartadoTemplateFile } from "@/lib/types/documentation";

interface Props {
  templates: ApartadoTemplateFile[];
  onDownload: (templateId: string) => Promise<string>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ApartadoTemplatesList({ templates, onDownload }: Props) {
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
    <div className="border border-amber-100 bg-amber-50/40 rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
          Plantillas disponibles
        </p>
      </div>
      <ul className="space-y-1">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
            <button
              onClick={() => handleDownload(t.id)}
              disabled={downloadingId === t.id}
              className="text-brand-teal hover:underline disabled:opacity-50 cursor-pointer text-left truncate"
              title={t.file_name}
            >
              {t.file_name}
            </button>
            <span className="text-[10px] text-text-muted flex-shrink-0">{formatBytes(t.file_size)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
