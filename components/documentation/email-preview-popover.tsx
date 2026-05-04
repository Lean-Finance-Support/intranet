"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface EmailPreviewPopoverProps {
  // El elemento que dispara el preview. Se renderiza tal cual.
  trigger: React.ReactNode;
  // Carga perezosa: solo se llama al abrir, y solo una vez por sesión a no ser
  // que `cacheKey` cambie.
  fetchPreview: () => Promise<{ subject: string; html: string }>;
  // "hover" (default) → abre/cierra con el cursor o focus.
  // "click" → abre con click en el trigger; cierra con la "x" del header,
  //   click fuera, o tecla Escape.
  triggerMode?: "hover" | "click";
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
  triggerMode = "hover",
  cacheKey,
  caption,
  width = 600,
  height = 520,
  className,
}: EmailPreviewPopoverProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
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

  // En modo click: cerrar con click fuera del panel/trigger o con Escape.
  useEffect(() => {
    if (!open || triggerMode !== "click") return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        wrapperRef.current?.contains(t) ||
        panelRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, triggerMode]);

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
    if (triggerMode !== "hover") return;
    clearTimers();
    openTimerRef.current = window.setTimeout(() => {
      const next = computePosition();
      if (next) setPos(next);
      setOpen(true);
      void loadPreview();
    }, OPEN_DELAY_MS);
  }

  function handleLeave() {
    if (triggerMode !== "hover") return;
    clearTimers();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }

  function handleTriggerClick(e: React.MouseEvent) {
    if (triggerMode !== "click") return;
    e.preventDefault();
    e.stopPropagation();
    clearTimers();
    if (open) {
      setOpen(false);
      return;
    }
    const next = computePosition();
    if (next) setPos(next);
    setOpen(true);
    void loadPreview();
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
      onClick={handleTriggerClick}
    >
      {trigger}
      {open && pos && (
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={`${id}-subject`}
          className="fixed z-[80] pointer-events-auto"
          style={{ top: pos.top, left: pos.left, width, height }}
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
