"use client";

import { useState, useTransition } from "react";
import {
  setDashboardSheet,
  clearDashboardSheet,
  notifyClientDashboardReady,
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
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifyInfo, setNotifyInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isNotifying, startNotifyTransition] = useTransition();

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
          client_notified_at: config?.client_notified_at ?? null,
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

  function handleNotify() {
    if (
      !confirm(
        "¿Notificar al cliente que su dashboard está listo? Se enviará un email y una notificación in-app a las cuentas asociadas. Esta acción solo se puede hacer una vez."
      )
    )
      return;
    setNotifyError(null);
    setNotifyInfo(null);
    startNotifyTransition(async () => {
      try {
        const res = await notifyClientDashboardReady(companyId);
        setConfig((prev) =>
          prev ? { ...prev, client_notified_at: res.notified_at } : prev
        );
        if (res.email_failed > 0 || res.email_error) {
          setNotifyError(
            `Aviso: notificación in-app enviada a ${res.recipients} cuentas, pero el email falló. ${
              res.email_error ?? ""
            }`
          );
        } else {
          setNotifyInfo(
            `Notificación enviada a ${res.recipients} cuenta${res.recipients === 1 ? "" : "s"}.`
          );
        }
      } catch (err) {
        setNotifyError(
          err instanceof Error ? err.message : "No se pudo notificar al cliente."
        );
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

          {canEdit && (
            <div className="pt-2 border-t border-gray-100">
              {config.client_notified_at ? (
                <p className="text-[11px] text-text-muted leading-snug">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle"></span>
                  Cliente notificado el{" "}
                  <strong className="text-text-body">
                    {new Date(config.client_notified_at).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </strong>
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-text-muted leading-snug">
                    Comprueba antes el dashboard en <strong>Ver Dashboard</strong>. Al notificar se
                    enviará email y notificación in-app a las cuentas asociadas — solo una vez.
                  </p>
                  <button
                    type="button"
                    onClick={handleNotify}
                    disabled={isNotifying}
                    className="text-xs bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer"
                  >
                    {isNotifying ? "Notificando…" : "Notificar al cliente"}
                  </button>
                  {notifyError && (
                    <p className="text-[11px] text-red-500 leading-snug">{notifyError}</p>
                  )}
                  {notifyInfo && (
                    <p className="text-[11px] text-emerald-600 leading-snug">{notifyInfo}</p>
                  )}
                </div>
              )}
            </div>
          )}
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
          debe poder leer el Sheet. Las pestañas de ventas, compras y extractos se detectan por
          nombre.
        </p>
      )}
    </div>
  );
}
