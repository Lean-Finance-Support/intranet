"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildDestinations } from "@/lib/search/build-destinations";
import { rankDestinations } from "@/lib/search/match";
import type { SearchContext as SearchCtx, SearchDestination, SearchGroupId } from "@/lib/search/types";
import { MagnifyingGlassIcon, SearchIcon } from "./icons";

const GROUP_LABELS: Record<SearchGroupId, string> = {
  pages: "Páginas",
  clients: "Clientes",
  "client-sections": "Secciones de cliente",
  "company-switch": "Cambiar de empresa",
};

const GROUP_ORDER: SearchGroupId[] = ["pages", "clients", "client-sections", "company-switch"];

export default function SearchPalette({
  ctx,
  onClose,
}: {
  ctx: SearchCtx;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Origen de la última interacción. Mientras sea "keyboard" el hover del
  // ratón NO mueve el activeIndex (eso evita los saltos cuando navegas con
  // flechas y el cursor está parado sobre otro item).
  const lastInteractionRef = useRef<"keyboard" | "mouse">("keyboard");

  const allDestinations = useMemo(() => buildDestinations(ctx), [ctx]);

  const flatResults = useMemo<SearchDestination[]>(() => {
    if (query.trim().length === 0) {
      const pages = allDestinations.filter((d) => d.group === "pages");
      const clients = allDestinations.filter((d) => d.group === "clients").slice(0, 6);
      const switches = allDestinations.filter((d) => d.group === "company-switch");
      return [...pages, ...clients, ...switches];
    }
    return rankDestinations(allDestinations, query, 8);
  }, [allDestinations, query]);

  const grouped = useMemo(() => {
    const map = new Map<SearchGroupId, SearchDestination[]>();
    for (const d of flatResults) {
      const arr = map.get(d.group) ?? [];
      arr.push(d);
      map.set(d.group, arr);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      id: g,
      label: GROUP_LABELS[g],
      items: map.get(g)!,
    }));
  }, [flatResults]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(0);
    lastInteractionRef.current = "keyboard";
  }, []);

  // Refs estables para que el listener de teclado no se reasigne en cada render.
  const activeIndexRef = useRef(activeIndex);
  const flatResultsRef = useRef(flatResults);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
  useEffect(() => {
    flatResultsRef.current = flatResults;
  }, [flatResults]);

  const navigate = useCallback(
    (destination: SearchDestination) => {
      onClose();
      if (destination.group === "company-switch") {
        window.location.href = destination.href;
        return;
      }
      router.push(destination.href);
    },
    [onClose, router],
  );

  // Listener global de teclado: una sola subscripción que lee de refs.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        lastInteractionRef.current = "keyboard";
      }
      const total = flatResultsRef.current.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (total === 0) return;
        setActiveIndex((i) => (i + 1) % total);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (total === 0) return;
        setActiveIndex((i) => (i - 1 + total) % total);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const destination = flatResultsRef.current[activeIndexRef.current];
        if (destination) navigate(destination);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navigate, onClose]);

  // Detecta movimiento real del ratón para reactivar el hover. Sin esto, si
  // empiezas a navegar con teclado y el cursor está parado sobre un resultado,
  // un re-render dispararía mouseEnter y robaría el foco.
  useEffect(() => {
    function handleMove() {
      lastInteractionRef.current = "mouse";
    }
    window.addEventListener("mousemove", handleMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  // Scroll del item activo al viewport del listado, solo cuando la navegación
  // viene de teclado (si fue ratón, ya está visible).
  useEffect(() => {
    if (lastInteractionRef.current !== "keyboard") return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleHoverIndex = useCallback((idx: number) => {
    if (lastInteractionRef.current === "keyboard") return;
    setActiveIndex(idx);
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4">
      <button
        type="button"
        aria-label="Cerrar búsqueda"
        className="absolute inset-0 bg-brand-navy/20 backdrop-blur-[2px] cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <MagnifyingGlassIcon className="w-5 h-5 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Buscar páginas, clientes o secciones…"
            className="flex-1 text-base text-brand-navy placeholder:text-text-muted bg-transparent border-0 outline-none focus:outline-none focus-visible:outline-none focus:ring-0"
            style={{ outline: "none", boxShadow: "none" }}
          />
        </div>

        <div ref={listRef} className="overflow-y-auto max-h-[60vh]">
          {flatResults.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-text-muted">
              Sin resultados para <span className="font-medium text-brand-navy">{query}</span>.
            </div>
          ) : (
            <SearchResultList
              groups={grouped}
              activeIndex={activeIndex}
              onHover={handleHoverIndex}
              onSelect={navigate}
              flatResults={flatResults}
              query={query}
            />
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3 text-[11px] text-text-muted">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              navegar
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>↵</Kbd>
              ir
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>esc</Kbd>
              cerrar
            </span>
          </div>
          <span className="text-[10px] text-text-muted">
            {flatResults.length} resultado{flatResults.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-white border border-gray-200 text-[10px] font-semibold text-text-muted">
      {children}
    </kbd>
  );
}

function SearchResultList({
  groups,
  activeIndex,
  onHover,
  onSelect,
  flatResults,
  query,
}: {
  groups: Array<{ id: SearchGroupId; label: string; items: SearchDestination[] }>;
  activeIndex: number;
  onHover: (i: number) => void;
  onSelect: (d: SearchDestination) => void;
  flatResults: SearchDestination[];
  query: string;
}) {
  const indexFor = (d: SearchDestination) => flatResults.indexOf(d);
  return (
    <div className="py-2">
      {groups.map((group) => (
        <div key={group.id} className="py-1">
          <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-navy/60">
            {group.label}
          </div>
          {group.items.map((item) => {
            const idx = indexFor(item);
            const active = idx === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                data-index={idx}
                onMouseEnter={() => onHover(idx)}
                onClick={() => onSelect(item)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors cursor-pointer ${
                  active ? "bg-brand-teal/10" : "hover:bg-gray-50"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    active ? "bg-brand-teal text-white" : "bg-gray-100 text-brand-navy"
                  }`}
                >
                  <SearchIcon name={item.icon} className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-brand-navy truncate">
                    <Highlight text={item.label} query={query} />
                  </div>
                  {item.sublabel && (
                    <div className="text-[11px] text-text-muted truncate">{item.sublabel}</div>
                  )}
                </div>
                {active && (
                  <span className="text-[10px] text-brand-teal font-semibold flex-shrink-0">
                    ↵
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (tokens.length === 0) return <>{text}</>;
  const re = new RegExp(`(${tokens.join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="bg-brand-teal/20 text-brand-navy rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
