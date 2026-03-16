"use client";

import { useState, useEffect, useCallback } from "react";
import { getNotificationStatus, notifyClient } from "../actions";

interface NotifyButtonProps {
  companyId: string;
  companyName: string;
  quarter: number;
  year?: number;
}

export default function NotifyButton({
  companyId,
  companyName,
  quarter,
  year = 2026,
}: NotifyButtonProps) {
  const [notified, setNotified] = useState(false);
  const [notifiedAt, setNotifiedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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

  async function handleNotify() {
    if (!confirm(`¿Notificar a ${companyName} sobre el ${quarter}T ${year}?`)) return;

    setSending(true);
    try {
      await notifyClient(companyId, year, quarter);
      setNotified(true);
      setNotifiedAt(new Date().toISOString());
    } catch (err) {
      console.error("Error notificando:", err);
    } finally {
      setSending(false);
    }
  }

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

  return (
    <button
      onClick={handleNotify}
      disabled={sending}
      className="px-6 py-2.5 bg-brand-navy text-white rounded-lg font-medium text-sm hover:bg-brand-navy/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {sending ? "Enviando..." : "Notificar al cliente"}
    </button>
  );
}
