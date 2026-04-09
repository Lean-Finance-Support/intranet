"use client";

import { useState } from "react";
import { sendWelcomeEmail } from "../actions";

interface NotifyWelcomeButtonProps {
  companyId: string;
  alreadySent: boolean;
  sentAt: string | null;
  onSent: () => Promise<void>;
}

export default function NotifyWelcomeButton({
  companyId,
  alreadySent,
  sentAt,
  onSent,
}: NotifyWelcomeButtonProps) {
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (confirming) {
      setSending(true);
      setError(null);
      try {
        await sendWelcomeEmail(companyId);
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

  if (alreadySent) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-green-50 border border-green-200">
        <CheckIcon />
        <div>
          <p className="text-xs font-semibold text-green-800 leading-none mb-0.5">
            Notificación de bienvenida
          </p>
          {sentAt && (
            <p className="text-[10px] text-green-600 leading-none">
              Enviada el{" "}
              {new Date(sentAt).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      </div>
    );
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
            : "bg-brand-teal hover:bg-brand-teal/90 text-white"
          }
        `}
      >
        <MailIcon />
        {sending ? "Enviando..." : confirming ? "Confirmar envío" : "Notificación de bienvenida"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function MailIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
