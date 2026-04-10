"use client";

import { useState } from "react";

interface DownloadAllButtonProps {
  companyId: string;
  hasDocuments: boolean;
}

export default function DownloadAllButton({ companyId, hasDocuments }: DownloadAllButtonProps) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/admin/api/enisa-download?companyId=${companyId}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Error al descargar.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `enisa-documentacion-${companyId.slice(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al descargar.");
    } finally {
      setDownloading(false);
    }
  }

  if (!hasDocuments) return null;

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-text-body hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap flex-shrink-0"
    >
      <DownloadIcon />
      {downloading ? "Descargando..." : "Descargar todo (ZIP)"}
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}
