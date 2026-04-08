"use client";

import { useState, useRef, useEffect } from "react";

interface RejectionModalProps {
  title: string;
  onConfirm: (comment: string) => Promise<void>;
  onCancel: () => void;
}

export default function RejectionModal({ title, onConfirm, onCancel }: RejectionModalProps) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(comment.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-sm font-semibold text-brand-navy mb-1">Rechazar apartado</h3>
        <p className="text-xs text-text-muted mb-4 truncate">{title}</p>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-medium text-text-body mb-1">
            Motivo del rechazo *
          </label>
          <textarea
            ref={textareaRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            required
            placeholder="Explica al cliente por qué se rechaza este apartado..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal resize-none"
          />

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-text-muted hover:text-text-body transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !comment.trim()}
              className="px-4 py-2 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Rechazando..." : "Rechazar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
