"use client";

import { useSyncExternalStore } from "react";
import { useSearchPalette } from "./search-provider";
import { MagnifyingGlassIcon } from "./icons";

const noopSubscribe = () => () => {};
const getShortcutLabelClient = (): string =>
  /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
const getShortcutLabelServer = (): string | null => null;

export default function SearchTrigger({ collapsed }: { collapsed: boolean }) {
  const { setOpen } = useSearchPalette();
  // En SSR devolvemos null para que el kbd no se renderice. Tras hidratar se
  // muestra el atajo correcto. Evita el flash "Ctrl K" → "⌘K" que producía
  // mostrar un default seguro y luego corregirlo en cliente.
  const shortcutLabel = useSyncExternalStore(
    noopSubscribe,
    getShortcutLabelClient,
    getShortcutLabelServer,
  );

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={shortcutLabel ? `Buscar (${shortcutLabel})` : "Buscar"}
      className="relative flex items-center gap-3 w-full py-2.5 pr-3 pl-[18px] border-l-2 border-transparent text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer group/search"
    >
      <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        <MagnifyingGlassIcon className="w-5 h-5" />
      </span>
      <span
        className={`text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
          collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
        }`}
      >
        Buscar
      </span>
      {!collapsed && shortcutLabel && (
        <kbd className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-semibold text-white/70 group-hover/search:bg-white/15">
          {shortcutLabel}
        </kbd>
      )}
      {collapsed && shortcutLabel && (
        <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-gray-900 text-white text-xs whitespace-nowrap opacity-0 group-hover/search:opacity-100 transition-opacity duration-150 delay-150 pointer-events-none z-[100]">
          Buscar ({shortcutLabel})
        </span>
      )}
    </button>
  );
}
