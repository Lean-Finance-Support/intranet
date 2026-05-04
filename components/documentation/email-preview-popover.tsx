"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface EmailPreviewPopoverProps {
  // El elemento que dispara el preview en hover/focus. Se renderiza tal cual.
  trigger: React.ReactNode;
  // Carga perezosa: solo se llama al hacer hover/focus, y solo una vez por
  // sesión a no ser que `cacheKey` cambie.
  fetchPreview: () => Promise<{ subject: string; html: string }>;
  // Si cambia entre renders, invalida la caché y vuelve a pedir el HTML al
  // próximo hover (útil cuando el contexto del preview depende de un input
  // como un comentario o una empresa seleccionada).
  cacheKey?: string;
  // Texto pequeño debajo del subject (ej. "Vista previa con {empresa}").
  caption?: string;
  // Ancho/alto del panel; valores por defecto pensados para escritorio.
  width?: number;
  height?: number;
  // Permite que el wrapper sea block (útil cuando el trigger es un <label>
  // de ancho completo, como en la lista de apartados con email).
  className?: string;
}

interface CachedPreview {
  subject: string;
  html: string;
}

// Delay para evitar abrir/cerrar el popover por movimientos breves del cursor.
const OPEN_DELAY_MS = 180;
const CLOSE_DELAY_MS = 140;

export default function EmailPreviewPopover({
  trigger,
  fetchPreview,
  cacheKey,
  caption,
  width = 600,
  height = 520,
  className,
}: EmailPreviewPopoverProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CachedPreview | null>(null);
  // Coordenadas del panel en viewport (position: fixed). Recalculadas al abrir
  // y en cada scroll/resize mientras está abierto. Usar fixed evita que el
  // popover quede recortado por ancestros con overflow:hidden/auto (el caso
  // de los pasos en Asignación múltiple).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Invalida la caché si cambia el contexto (p.ej. el comentario en el modal).
  const lastKeyRef = useRef<string | undefined>(cacheKey);
  if (lastKeyRef.current !== cacheKey) {
    lastKeyRef.current = cacheKey;
    if (preview) setPreview(null);
  }

  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  function clearTimers() {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  useEffect(() => () => clearTimers(), []);

  function computePosition() {
    const trigger = wrapperRef.current;
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const fitsRight = rect.right + width + margin <= window.innerWidth;
    const fitsLeft = rect.left - width - margin >= 0;
    let left: number;
    if (fitsRight) {
      left = rect.right + gap;
    } else if (fitsLeft) {
      left = rect.left - width - gap;
    } else {
      // Centrado horizontal como último recurso (viewport estrecho).
      left = Math.max(margin, (window.innerWidth - width) / 2);
    }
    const desiredTop = rect.top + rect.height / 2 - height / 2;
    const top = Math.max(
      margin,
      Math.min(desiredTop, window.innerHeight - height - margin)
    );
    return { top, left };
  }

  // Mientras el popover está abierto, recalcula la posición al hacer scroll
  // o resize del viewport, así sigue al trigger sin desincronizarse.
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const next = computePosition();
      if (next) setPos(next);
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // computePosition usa width/height que son props; si cambian, mejor reabrir.
  }, [open, width, height]);

  async function loadPreview() {
    if (preview || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPreview();
      setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la vista previa");
    } finally {
      setLoading(false);
    }
  }

  function handleEnter() {
    clearTimers();
    openTimerRef.current = window.setTimeout(() => {
      const next = computePosition();
      if (next) setPos(next);
      setOpen(true);
      void loadPreview();
    }, OPEN_DELAY_MS);
  }

  function handleLeave() {
    clearTimers();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }

  function handleClose() {
    clearTimers();
    setOpen(false);
  }

  return (
    <span
      ref={wrapperRef}
      className={`relative ${className ?? "inline-flex"}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      {trigger}
      {open && pos && (
        <div
          role="dialog"
          aria-labelledby={`${id}-subject`}
          className="fixed z-[80] pointer-events-auto"
          style={{ top: pos.top, left: pos.left, width, height }}
          onMouseEnter={() => clearTimers()}
          onMouseLeave={handleLeave}
        >
          {/* Marco exterior con borde dashed teal para marcar visualmente que
              esto es una previsualización, no el email real. */}
          <div className="flex flex-col w-full h-full bg-white rounded-xl border-2 border-dashed border-brand-teal/60 shadow-2xl overflow-hidden ring-1 ring-black/5">
            {/* Banner "VISTA PREVIA" con franja teal — más visible que el header
                gris anterior, deja claro que es preview y no envío. */}
            <div className="flex items-center gap-2 px-4 py-2 bg-brand-teal/10 border-b border-brand-teal/30">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-teal bg-white px-2 py-0.5 rounded-full border border-brand-teal/40">
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx={12} cy={12} r={3} />
                </svg>
                Vista previa
              </span>
              <span className="text-[10px] text-brand-teal/80 font-medium">
                Este email no se ha enviado todavía
              </span>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Cerrar vista previa"
                className="ml-auto text-brand-teal/70 hover:text-brand-teal p-1 rounded-md cursor-pointer"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Subject + caption */}
            <div className="px-4 py-2 border-b border-gray-100 bg-white">
              <p
                id={`${id}-subject`}
                className="text-sm font-medium text-brand-navy truncate"
                title={preview?.subject ?? ""}
              >
                {loading
                  ? "Cargando…"
                  : preview?.subject ?? (error ? "Error" : "—")}
              </p>
              {caption && (
                <p className="text-[11px] text-text-muted truncate mt-0.5">{caption}</p>
              )}
            </div>
            <div className="flex-1 min-h-0 bg-[#f4f5f7]">
              {error ? (
                <div className="h-full flex items-center justify-center px-6 text-center">
                  <p className="text-sm text-text-muted">{error}</p>
                </div>
              ) : loading || !preview ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-text-muted text-xs">Cargando vista previa…</div>
                </div>
              ) : (
                <iframe
                  // sandbox="" desactiva scripts/forms/etc — el HTML del email
                  // viene de nuestro propio builder, pero cinturón y tirantes.
                  sandbox=""
                  title="Vista previa del email"
                  srcDoc={preview.html}
                  style={{ width: "100%", height: "100%", border: 0 }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
