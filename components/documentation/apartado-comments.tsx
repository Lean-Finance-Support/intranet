"use client";

import { useState } from "react";
import type {
  ApartadoComment,
  ApartadoStatusHistoryEntry,
} from "@/lib/types/documentation";
import { describeHistoryEntry } from "./apartado-detail-history";

interface Props {
  comments: ApartadoComment[];
  history?: ApartadoStatusHistoryEntry[];
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

export default function ApartadoComments({
  comments,
  history = [],
  currentUserId,
  onAdd,
}: Props) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    // Optimista: limpiamos el textarea de inmediato. Si la llamada falla,
    // restauramos el contenido y mostramos el error.
    setBody("");
    setError(null);
    try {
      await onAdd(trimmed);
    } catch (e) {
      setBody(trimmed);
      setError(e instanceof Error ? e.message : "Error al enviar");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
        Comentarios
        <span className="font-normal normal-case tracking-normal text-text-muted/80">
          {" "}
          · {comments.length}
        </span>
      </p>

      {comments.length === 0 ? (
        <p className="text-sm italic text-text-muted/80 mt-3">
          Aún sin comentarios
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {comments.map((c) => {
            const mine = c.author_id === currentUserId;
            const isGhost = c.id.startsWith("ghost-");
            return (
              <li
                key={c.id}
                className={`flex gap-3 ${isGhost ? "opacity-60" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0 ${
                    mine ? "bg-brand-teal text-white" : "bg-brand-navy text-white"
                  }`}
                  aria-hidden
                >
                  {getInitials(c.author_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-brand-navy whitespace-nowrap">
                      {c.author_name ?? "—"}
                    </span>
                    <span className="text-[11px] text-text-muted whitespace-nowrap flex-shrink-0 ml-auto">
                      {formatDateTime(c.created_at)}
                    </span>
                  </div>
                  <p
                    className="text-sm text-text-body mt-1 leading-relaxed whitespace-pre-wrap break-words"
                    style={{ textWrap: "pretty" }}
                  >
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un comentario…"
          rows={2}
          className="w-full text-sm text-text-body placeholder:text-text-muted/70 bg-gray-50/60 border border-gray-200 rounded-xl px-3.5 py-2.5 resize-none focus:outline-none focus:border-brand-teal/60 focus:bg-white"
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={!body.trim()}
            className="text-xs font-medium text-white px-3.5 py-1.5 rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed bg-brand-teal"
          >
            Enviar
          </button>
        </div>
      </form>

      {history.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-muted hover:text-text-body cursor-pointer whitespace-nowrap"
          >
            <svg
              width={11}
              height={11}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: historyOpen ? "rotate(90deg)" : "none",
                transition: "transform 0.15s",
              }}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            <span>Ver historial de cambios ({history.length})</span>
          </button>
          {historyOpen && (
            <ol className="mt-3 space-y-2 pl-4 border-l-2 border-gray-100">
              {history.map((h) => (
                <li key={h.id} className="text-xs text-text-muted relative">
                  <span className="absolute -left-[19px] top-1.5 w-2 h-2 rounded-full bg-gray-300" />
                  <span className="text-text-body">{describeHistoryEntry(h)}</span>
                  <span className="ml-2 text-text-muted/80">
                    ·{" "}
                    {new Date(h.changed_at).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
