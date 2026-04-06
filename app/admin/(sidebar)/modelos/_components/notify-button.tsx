"use client";

import { useState, useEffect, useCallback } from "react";
import { getNotificationStatus, notifyClient } from "../actions";

interface NotifyButtonProps {
  companyId: string;
  companyName: string;
  quarter: number;
  year?: number;
  canEdit?: boolean;
  onBeforeSend?: () => Promise<void>;
}

export default function NotifyButton({
  companyId,
  companyName,
  quarter,
  year = 2026,
  canEdit = true,
  onBeforeSend,
}: NotifyButtonProps) {
  const [notified, setNotified] = useState(false);
  const [notifiedAt, setNotifiedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0); // 0=idle, 1=first confirm, 2=sending

  const loadStatus = useCallback(async () => {
    try {
      const status = await getNotificationStatus(companyId, year, quarter);
      setNotified(status.notified);
      setNotifiedAt(status.notified_at);
    } catch {
      // ignore
    }
  }, [companyId, year, quarter]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Reset confirm step if user changes company/quarter
  useEffect(() => {
    setConfirmStep(0);
  }, [companyId, quarter, year]);

  // Auto-reset confirm step after 5 seconds
  useEffect(() => {
    if (confirmStep === 1) {
      const timer = setTimeout(() => setConfirmStep(0), 5000);
      return () => clearTimeout(timer);
    }
  }, [confirmStep]);

  async function handleClick() {
    if (confirmStep === 0) {
      setConfirmStep(1);
      return;
    }

    // confirmStep === 1 → second click, send notification
    setSending(true);
    setConfirmStep(2);
    try {
      await onBeforeSend?.();
      await notifyClient(companyId, year, quarter);
      setNotified(true);
      setNotifiedAt(new Date().toISOString());
    } catch (err) {
      console.error("Error notificando:", err);
    } finally {
      setSending(false);
      setConfirmStep(0);
    }
  }

  if (!canEdit) return null;

  if (notified && notifiedAt) {
    const date = new Date(notifiedAt).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Notificado el {date}
      </div>
    );
  }

  const buttonLabel =
    sending
      ? "Enviando..."
      : confirmStep === 1
        ? `¿Confirmar notificación a ${companyName}?`
        : "Notificar al cliente";

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={sending}
        className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          confirmStep === 1
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-brand-navy hover:bg-brand-navy/90 text-white"
        }`}
      >
        {buttonLabel}
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
  );
}
