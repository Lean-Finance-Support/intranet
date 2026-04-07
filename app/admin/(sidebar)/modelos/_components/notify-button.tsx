"use client";

import { useState, useEffect, useCallback } from "react";
import { getNotificationStatus, notifyClient, notifyPresentation } from "../actions";

interface NotifyButtonProps {
  companyId: string;
  companyName: string;
  quarter: number;
  year?: number;
  canEdit?: boolean;
  allAccepted?: boolean;
  presented?: boolean;
  onBeforeSend?: () => Promise<void>;
  onNotified?: () => void;
  onPresentationSent?: () => void;
  onStatusLoaded?: (presented: boolean) => void;
}

export default function NotifyButton({
  companyId,
  companyName,
  quarter,
  year = 2026,
  canEdit = true,
  allAccepted = false,
  presented = false,
  onBeforeSend,
  onNotified,
  onPresentationSent,
  onStatusLoaded,
}: NotifyButtonProps) {
  const [notifiedAt, setNotifiedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendingPresentation, setSendingPresentation] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0); // 0=idle, 1=confirm notify, 2=sending
  const [confirmPresentationStep, setConfirmPresentationStep] = useState(0);
  const [presentationSent, setPresentationSent] = useState(false);

  const [localPresented, setLocalPresented] = useState(presented);

  const loadStatus = useCallback(async () => {
    try {
      const status = await getNotificationStatus(companyId, year, quarter);
      setNotifiedAt(status.notified_at);
      setLocalPresented(status.presented);
      onStatusLoaded?.(status.presented);
    } catch {
      // ignore
    }
  }, [companyId, year, quarter, onStatusLoaded]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Reset confirm steps if user changes company/quarter
  useEffect(() => {
    setConfirmStep(0);
    setConfirmPresentationStep(0);
    setPresentationSent(false);
    setLocalPresented(presented);
  }, [companyId, quarter, year, presented]);

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
      setNotifiedAt(new Date().toISOString());
      onNotified?.();
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
      setLocalPresented(true);
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

  // If presentation has been sent, show locked state
  if (localPresented) {
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
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={handleNotifyClick}
          disabled={sending}
          className={`px-5 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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

      {/* Presentation button — only when all models accepted */}
      {allAccepted && !presentationSent && (
        <div className="flex items-center gap-3">
          <button
            onClick={handlePresentationClick}
            disabled={sendingPresentation}
            className={`px-5 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
        </div>
      )}

      {presentationSent && (
        <span className="text-sm text-green-600 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Presentación notificada
        </span>
      )}

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
