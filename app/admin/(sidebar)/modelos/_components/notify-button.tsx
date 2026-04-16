"use client";

import { useState, useEffect } from "react";
import { notifyClient, notifyPresentation } from "../actions";

interface NotifyButtonProps {
  companyId: string;
  companyName: string;
  quarter: number;
  year?: number;
  canEdit?: boolean;
  allAccepted?: boolean;
  presented?: boolean;
  loading?: boolean;
  initialNotifiedAt?: string | null;
  onBeforeSend?: () => Promise<void>;
  onNotified?: (notifiedAt?: string) => void;
  onPresentationSent?: () => void;
}

export default function NotifyButton({
  companyId,
  companyName,
  quarter,
  year = 2026,
  canEdit = true,
  allAccepted = false,
  presented = false,
  loading = false,
  initialNotifiedAt = null,
  onBeforeSend,
  onNotified,
  onPresentationSent,
}: NotifyButtonProps) {
  const [notifiedAt, setNotifiedAt] = useState<string | null>(initialNotifiedAt);
  const [sending, setSending] = useState(false);
  const [sendingPresentation, setSendingPresentation] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0);
  const [confirmPresentationStep, setConfirmPresentationStep] = useState(0);
  const [presentationSent, setPresentationSent] = useState(false);

  // Sync notifiedAt when parent provides initial data
  useEffect(() => {
    setNotifiedAt(initialNotifiedAt);
  }, [initialNotifiedAt]);

  // Auto-reset confirm steps after 5 seconds
  useEffect(() => {
    if (confirmStep === 1) {
      const timer = setTimeout(() => setConfirmStep(0), 5000);
      return () => clearTimeout(timer);
    }
  }, [confirmStep]);

  useEffect(() => {
    if (confirmPresentationStep === 1) {
      const timer = setTimeout(() => setConfirmPresentationStep(0), 5000);
      return () => clearTimeout(timer);
    }
  }, [confirmPresentationStep]);

  async function handleNotifyClick() {
    if (confirmStep === 0) {
      setConfirmStep(1);
      return;
    }

    setSending(true);
    setConfirmStep(2);
    try {
      await onBeforeSend?.();
      await notifyClient(companyId, year, quarter);
      const now = new Date().toISOString();
      setNotifiedAt(now);
      onNotified?.(now);
    } catch (err) {
      console.error("Error notificando:", err);
    } finally {
      setSending(false);
      setConfirmStep(0);
    }
  }

  async function handlePresentationClick() {
    if (confirmPresentationStep === 0) {
      setConfirmPresentationStep(1);
      return;
    }

    setSendingPresentation(true);
    setConfirmPresentationStep(2);
    try {
      await notifyPresentation(companyId, year, quarter);
      setPresentationSent(true);
      setNotifiedAt(new Date().toISOString());
      onPresentationSent?.();
    } catch (err) {
      console.error("Error notificando presentación:", err);
    } finally {
      setSendingPresentation(false);
      setConfirmPresentationStep(0);
    }
  }

  if (!canEdit) return null;

  if (loading) {
    return <div className="h-9 w-36 rounded-lg bg-gray-200 animate-pulse flex-shrink-0" />;
  }

  // If presentation has been sent, show locked state
  if (presented) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-sm font-medium text-green-700">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Modelos presentados
        </span>
        {notifiedAt && (
          <span className="text-xs text-text-muted">
            {new Date(notifiedAt).toLocaleDateString("es-ES", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </span>
        )}
      </div>
    );
  }

  const notifyLabel =
    sending
      ? "Enviando..."
      : confirmStep === 1
        ? `¿Confirmar notificación a ${companyName}?`
        : "Notificar al cliente";

  const presentationLabel =
    sendingPresentation
      ? "Enviando..."
      : confirmPresentationStep === 1
        ? `¿Confirmar presentación a ${companyName}?`
        : "Notificar presentación";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Botón: Notificar presentación (aparece antes si está disponible) */}
        {allAccepted && !presentationSent && (
          <>
            <button
              onClick={handlePresentationClick}
              disabled={sendingPresentation}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                confirmPresentationStep === 1
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              {presentationLabel}
            </button>
            {confirmPresentationStep === 1 && (
              <button
                onClick={() => setConfirmPresentationStep(0)}
                className="text-sm text-text-muted hover:text-text-body transition-colors"
              >
                Cancelar
              </button>
            )}
          </>
        )}

        {presentationSent && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Presentación notificada
          </span>
        )}

        {/* Botón: Notificar al cliente */}
        <button
          onClick={handleNotifyClick}
          disabled={sending}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            confirmStep === 1
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-brand-navy hover:bg-brand-navy/90 text-white"
          }`}
        >
          {notifyLabel}
        </button>
        {confirmStep === 1 && (
          <button
            onClick={() => setConfirmStep(0)}
            className="text-sm text-text-muted hover:text-text-body transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>

      {notifiedAt && (
        <span className="text-xs text-text-muted">
          Última notificación: {new Date(notifiedAt).toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </div>
  );
}
