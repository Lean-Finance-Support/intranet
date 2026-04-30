"use client";

import { useState } from "react";
import type { ApartadoStatus, ClientBlock } from "@/lib/types/documentation";
import StatusBadge, { statusColor, statusDotColor } from "./status-badge";

interface Props {
  blocks: ClientBlock[];
  selectedBlockId: string | null;
  selectedApartadoId: string | null;
  onSelectBlock: (id: string) => void;
  onSelectApartado: (id: string) => void;
  onAddBlock?: () => void;
  badgeVariant?: "admin" | "client";
}

function blockState(block: ClientBlock): ApartadoStatus | "validado" {
  // Los apartados opcionales no influyen en el estado del bloque.
  const required = block.apartados.filter((a) => !a.is_optional);
  const total = required.length;
  if (total === 0) return "pendiente";
  const validated = required.filter((a) => a.status === "validado").length;
  if (validated === total) return "validado";
  if (required.some((a) => a.status === "rechazado")) return "rechazado";
  if (required.some((a) => a.status === "enviado")) return "enviado";
  return "pendiente";
}

function BlockCircle({
  index,
  status,
  active,
}: {
  index: number;
  status: ApartadoStatus;
  active: boolean;
}) {
  const isDone = status === "validado";
  const color = statusColor(status);
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 transition-all"
      style={{
        width: 28,
        height: 28,
        backgroundColor: isDone ? color : "white",
        border: `${active ? 2 : 1.5}px solid ${active ? "#0B1333" : color}`,
        color: isDone ? "white" : active ? "#0B1333" : color,
        boxShadow: active ? "0 0 0 4px rgba(11,19,51,0.08)" : "none",
      }}
    >
      {isDone ? (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <span className="text-[11px] font-bold">{index}</span>
      )}
    </div>
  );
}

export default function BlockList({
  blocks,
  selectedBlockId,
  selectedApartadoId,
  onSelectBlock,
  onSelectApartado,
  onAddBlock,
  badgeVariant = "admin",
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (blocks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
        <p className="text-sm text-text-muted">No hay documentación asignada todavía.</p>
      </div>
    );
  }

  return (
    <aside className="w-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
          Bloques
        </p>
        {onAddBlock && (
          <button
            onClick={onAddBlock}
            className="text-xs font-medium text-brand-teal hover:bg-brand-teal/10 bg-brand-teal/5 px-3 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Añadir bloque
          </button>
        )}
      </div>
      <div className="space-y-2">
        {blocks.map((block, idx) => {
          // Los apartados opcionales no cuentan para el progreso del bloque.
          const required = block.apartados.filter((a) => !a.is_optional);
          const total = required.length;
          const validated = required.filter((a) => a.status === "validado").length;
          const ratio = total === 0 ? 0 : validated / total;
          const isActive = block.id === selectedBlockId;
          const isOpen = expanded.has(block.id) || isActive;
          const bState = blockState(block) as ApartadoStatus;

          return (
            <div
              key={block.id}
              className={`rounded-2xl border transition-all ${
                isActive
                  ? "bg-white border-brand-navy/20 shadow-sm"
                  : "bg-white/60 border-transparent hover:bg-white"
              }`}
            >
              <button
                onClick={() => {
                  toggle(block.id);
                  onSelectBlock(block.id);
                }}
                className="w-full text-left p-3 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <BlockCircle
                    index={idx + 1}
                    status={bState}
                    active={isActive}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-sm flex-1 truncate ${
                          isActive
                            ? "font-semibold text-brand-navy"
                            : "font-medium text-text-body"
                        }`}
                      >
                        {block.name}
                      </p>
                      <span className="text-[10px] font-mono text-text-muted">
                        {validated}/{total}
                      </span>
                    </div>
                    {block.description && (
                      <p
                        className="text-[11px] text-text-muted mt-0.5 leading-snug line-clamp-2"
                        style={{ textWrap: "pretty" }}
                      >
                        {block.description}
                      </p>
                    )}
                    <div className="mt-2 w-full rounded-full overflow-hidden h-[3px] bg-brand-navy/[0.07]">
                      <div
                        className="h-full bg-brand-teal rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </button>

              {isOpen && block.apartados.length > 0 && (
                <div className="px-2 pb-2 space-y-0.5">
                  {block.apartados.map((a) => {
                    const isSelected =
                      block.id === selectedBlockId && a.id === selectedApartadoId;
                    return (
                      <button
                        key={a.id}
                        onClick={() => {
                          onSelectBlock(block.id);
                          onSelectApartado(a.id);
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer transition-colors ${
                          isSelected ? "" : "hover:bg-gray-50"
                        }`}
                        style={
                          isSelected
                            ? { backgroundColor: "rgba(0,176,183,0.10)" }
                            : undefined
                        }
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: statusDotColor(a.status) }}
                        />
                        <span
                          className={`text-[12.5px] flex-1 truncate ${
                            isSelected
                              ? "text-brand-navy font-medium"
                              : "text-text-body"
                          }`}
                        >
                          {a.name}
                          {a.is_optional && (
                            <span
                              className="ml-1.5 text-[9px] uppercase tracking-wider font-semibold text-brand-navy/50"
                              title="Opcional — no cuenta en el progreso"
                            >
                              opcional
                            </span>
                          )}
                        </span>
                        <StatusBadge status={a.status} size="xs" variant={badgeVariant} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
