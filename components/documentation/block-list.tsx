"use client";

import type { ApartadoStatus, ClientBlock } from "@/lib/types/documentation";
import StatusBadge from "./status-badge";

interface Props {
  blocks: ClientBlock[];
  selectedBlockId: string | null;
  selectedApartadoId: string | null;
  onSelectBlock: (id: string) => void;
  onSelectApartado: (id: string) => void;
  showInReview?: boolean;
  badgeVariant?: "default" | "client";
}

const APARTADO_LEFT_BORDER: Record<ApartadoStatus, string> = {
  pendiente: "border-l-status-pending-fg",
  enviado: "border-l-status-review",
  validado: "border-l-status-validated",
  rechazado: "border-l-status-rejected",
};

export default function BlockList({
  blocks,
  selectedBlockId,
  selectedApartadoId,
  onSelectBlock,
  onSelectApartado,
  showInReview = true,
  badgeVariant = "default",
}: Props) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
        <p className="text-sm text-text-muted">No hay documentación asignada todavía.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted px-1">
        Bloques
      </p>
      {blocks.map((block, idx) => {
        const total = block.apartados.length;
        const validated = block.apartados.filter((a) => a.status === "validado").length;
        const inReview = block.apartados.filter((a) => a.status === "enviado").length;
        const pct = total === 0 ? 0 : Math.round((validated / total) * 100);
        const selected = selectedBlockId === block.id;
        return (
          <div
            key={block.id}
            className={`rounded-xl border transition-all overflow-hidden ${
              selected
                ? "border-brand-teal/40 bg-gradient-to-b from-brand-teal/5 to-brand-teal/[0.02] shadow-sm"
                : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm"
            }`}
          >
            <button
              onClick={() => onSelectBlock(block.id)}
              className="w-full text-left px-4 py-3 cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 text-xs font-semibold transition-colors ${
                    validated === total && total > 0
                      ? "bg-green-100 text-green-700"
                      : selected
                      ? "bg-brand-teal text-white"
                      : "bg-gray-100 text-text-muted"
                  }`}
                >
                  {validated === total && total > 0 ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-body truncate">{block.name}</p>
                  {block.description && (
                    <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">{block.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-teal transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-text-muted font-medium tabular-nums">
                      {validated}/{total}
                    </span>
                    {showInReview && inReview > 0 && (
                      <span className="text-[10px] text-status-review font-medium tabular-nums">
                        {inReview} a revisar
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>

            {selected && total > 0 && (
              <ul className="px-3 pb-3 pt-0.5 space-y-1.5">
                {block.apartados.map((a) => {
                  const active = selectedApartadoId === a.id;
                  return (
                    <li key={a.id}>
                      <button
                        onClick={() => onSelectApartado(a.id)}
                        className={`group w-full text-left flex items-center justify-between gap-2 pl-3 pr-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer border border-l-[3px] ${APARTADO_LEFT_BORDER[a.status]} ${
                          active
                            ? "bg-brand-teal/7 text-brand-navy font-semibold border-y-brand-teal/25 border-r-brand-teal/25 shadow-sm"
                            : "bg-white text-text-body border-y-gray-100 border-r-gray-100 hover:border-y-gray-200 hover:border-r-gray-200 hover:shadow-sm"
                        }`}
                      >
                        <span className="truncate font-medium">{a.name}</span>
                        <StatusBadge status={a.status} size="xs" variant={badgeVariant} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
