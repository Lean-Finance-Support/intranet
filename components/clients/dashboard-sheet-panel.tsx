"use client";

import { useState, useTransition } from "react";
import {
  setDashboardSheet,
  clearDashboardSheet,
  type CompanyDashboardConfig,
} from "@/app/admin/clientes/actions";

interface Props {
  companyId: string;
  initialConfig: CompanyDashboardConfig | null;
  authorizedEmail: string | null;
  canEdit: boolean;
}

export default function DashboardSheetPanel({
  companyId,
  initialConfig,
  authorizedEmail,
  canEdit,
}: Props) {
  const [config, setConfig] = useState<CompanyDashboardConfig | null>(initialConfig);
  const [editing, setEditing] = useState(initialConfig === null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await setDashboardSheet(companyId, url);
        setConfig({
          sheet_id: res.sheet_id,
          sheet_name: null,
          sheet_gid: null,
          updated_at: new Date().toISOString(),
        });
        setEditing(false);
        setUrl("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la configuración.");
      }
    });
  }

  function handleClear() {
    if (!confirm("¿Quitar la configuración del Sheet del dashboard de esta empresa?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await clearDashboardSheet(companyId);
        setConfig(null);
        setEditing(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo eliminar la configuración.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
        Google Sheet del dashboard
      </p>

      {!editing && config && (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-body truncate">
                <span className="text-text-muted">Sheet:</span>{" "}
                <a
                  href={`https://docs.google.com/spreadsheets/d/${config.sheet_id}/edit${
                    config.sheet_gid != null ? `#gid=${config.sheet_gid}` : ""
                  }`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-teal hover:underline"
                >
                  {config.sheet_id}
                </a>
              </p>
            </div>
            {canEdit && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setUrl(
                      `https://docs.google.com/spreadsheets/d/${config.sheet_id}/edit${
                        config.sheet_gid != null ? `#gid=${config.sheet_gid}` : ""
                      }`
                    );
                  }}
                  className="text-[11px] text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer"
                >
                  Editar
                </button>
                <span className="text-text-muted">·</span>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isPending}
                  className="text-[11px] text-red-500 hover:text-red-600 font-medium cursor-pointer disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && canEdit && (
        <div className="space-y-2">
          <div>
            <label className="block text-[10px] text-text-muted mb-1">URL del Google Sheet</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              disabled={isPending}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal bg-white disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !url.trim()}
              className="text-xs bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer"
            >
              {isPending ? "Comprobando…" : "Guardar"}
            </button>
            {config && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                  setUrl("");
                }}
                disabled={isPending}
                className="text-xs text-text-muted hover:text-text-body cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {!canEdit && !config && (
        <p className="text-xs text-text-muted italic">Sin Sheet configurado todavía.</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {canEdit && authorizedEmail && (
        <p className="text-[10px] text-text-muted leading-snug">
          La cuenta{" "}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">{authorizedEmail}</code>{" "}
          debe tener al menos permiso de lectura sobre el Sheet, y este debe contener las pestañas
          <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">facturasVentaHolded_lineas</code>,
          <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">Facturas_compra_holded</code> y
          <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">extractosBancarios</code>.
        </p>
      )}
    </div>
  );
}
