"use client";

import { useState } from "react";

interface SubmitButtonProps {
  onSubmit: () => Promise<void>;
  submitting: boolean;
  disabled: boolean;
  hasSubmitted: boolean;
}

export default function SubmitButton({ onSubmit, submitting, disabled, hasSubmitted }: SubmitButtonProps) {
  const [confirming, setConfirming] = useState(false);

  function handleClick() {
    if (confirming) {
      setConfirming(false);
      onSubmit();
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 5000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={submitting || disabled}
      className={`
        px-6 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${confirming
          ? "bg-amber-500 hover:bg-amber-600 text-white"
          : "bg-brand-teal hover:bg-brand-teal/90 text-white"
        }
      `}
    >
      {submitting
        ? "Enviando..."
        : confirming
        ? "Confirmar envío"
        : hasSubmitted
        ? "Enviar documentación actualizada"
        : "Enviar documentación"}
    </button>
  );
}
