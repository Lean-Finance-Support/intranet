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
  const [side, setSide] = useState<"right" | "left">("right");
  const [topOffset, setTopOffset] = useState(0);

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

  // Al abrir, decide si el panel cabe a la derecha; si no, lo coloca a la
  // izquierda. También baja el top si el trigger está cerca del borde superior.
  function positionPanel() {
    const trigger = wrapperRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const fitsRight = rect.right + width + margin <= window.innerWidth;
    setSide(fitsRight ? "right" : "left");
    // Centrar vertical respecto al trigger, pero clamp al viewport.
    const desiredTop = rect.top + rect.height / 2 - height / 2;
    const clampedTop = Math.max(
      margin,
      Math.min(desiredTop, window.innerHeight - height - margin)
    );
    setTopOffset(clampedTop - rect.top);
  }

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
      positionPanel();
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
      {open && (
        <div
          role="dialog"
          aria-labelledby={`${id}-subject`}
          className="absolute z-[80] pointer-events-auto"
          style={{
            top: topOffset,
            ...(side === "right"
              ? { left: "calc(100% + 8px)" }
              : { right: "calc(100% + 8px)" }),
            width,
            height,
          }}
          onMouseEnter={() => clearTimers()}
          onMouseLeave={handleLeave}
        >
          <div className="flex flex-col w-full h-full bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden">
            <div className="flex items-start gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  Vista previa del email
                </p>
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
                  <p className="text-[11px] text-text-muted truncate">{caption}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Cerrar vista previa"
                className="text-text-muted hover:text-text-body p-1 rounded-md cursor-pointer"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
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
