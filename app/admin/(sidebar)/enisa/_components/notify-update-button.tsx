"use client";

import { useState } from "react";
import { sendUpdateEmail } from "../actions";

interface NotifyUpdateButtonProps {
  companyId: string;
  lastSentAt: string | null;
  updateCount: number;
  onSent: () => Promise<void>;
}

export default function NotifyUpdateButton({
  companyId,
  lastSentAt,
  updateCount,
  onSent,
}: NotifyUpdateButtonProps) {
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (confirming) {
      setSending(true);
      setError(null);
      try {
        await sendUpdateEmail(companyId);
        setConfirming(false);
        await onSent();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al enviar.");
      } finally {
        setSending(false);
      }
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 5000);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={sending}
        className={`
          inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50
          ${confirming
            ? "bg-amber-500 hover:bg-amber-600 text-white"
            : "bg-white border border-brand-navy/20 text-brand-navy hover:border-brand-navy/50 hover:bg-gray-50"
          }
        `}
      >
        <BellIcon confirming={confirming} />
        {sending ? "Enviando..." : confirming ? "Confirmar envío" : "Enviar actualización"}
      </button>
      {lastSentAt && !confirming && (
        <p className="text-[10px] text-text-muted leading-none pl-0.5">
          Último envío{" "}
          {new Date(lastSentAt).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          {updateCount > 1 && ` · ${updateCount} enviados`}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function BellIcon({ confirming }: { confirming: boolean }) {
  return (
    <svg
      className={`w-4 h-4 ${confirming ? "text-white" : "text-brand-navy"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}
