"use client";

import { useState } from "react";
import type { ApartadoComment } from "@/lib/types/documentation";

interface Props {
  comments: ApartadoComment[];
  currentUserId: string;
  onAdd: (body: string) => Promise<void>;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ApartadoComments({ comments, currentUserId, onAdd }: Props) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAdd(body.trim());
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Comentarios
      </p>
      {comments.length === 0 && (
        <p className="text-xs text-text-muted italic">Aún sin comentarios</p>
      )}
      <ul className="space-y-3">
        {comments.map((c) => {
          const mine = c.author_id === currentUserId;
          return (
            <li key={c.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${
                mine ? "bg-brand-teal text-white" : "bg-brand-navy/10 text-brand-navy"
              }`}>
                {getInitials(c.author_name)}
              </div>
              <div className={`flex-1 min-w-0 ${mine ? "text-right" : ""}`}>
                <div className="flex items-center gap-2 text-[11px] text-text-muted mb-0.5"
                     style={mine ? { justifyContent: "flex-end" } : {}}>
                  <span className="font-medium text-text-body">{c.author_name ?? "—"}</span>
                  <span>·</span>
                  <span>{formatDateTime(c.created_at)}</span>
                </div>
                <div
                  className={`inline-block max-w-full rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    mine
                      ? "bg-brand-teal/10 text-text-body"
                      : "bg-gray-100 text-text-body"
                  }`}
                >
                  {c.body}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Escribe un comentario..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal resize-none"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="text-xs bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </form>
    </div>
  );
}
