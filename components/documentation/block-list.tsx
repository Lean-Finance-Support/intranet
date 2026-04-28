"use client";

import type { ClientBlock } from "@/lib/types/documentation";

interface Props {
  blocks: ClientBlock[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
}

export default function BlockList({ blocks, selectedBlockId, onSelectBlock }: Props) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
        <p className="text-sm text-text-muted">No hay documentación asignada todavía.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted px-1">
        Bloques
      </p>
      {blocks.map((block, idx) => {
        const total = block.apartados.length;
        const validated = block.apartados.filter((a) => a.status === "validado").length;
        const rejected = block.apartados.filter((a) => a.status === "rechazado").length;
        const pct = total === 0 ? 0 : Math.round((validated / total) * 100);
        const selected = selectedBlockId === block.id;
        return (
          <button
            key={block.id}
            onClick={() => onSelectBlock(block.id)}
            className={`w-full text-left rounded-xl border px-4 py-3 transition-colors cursor-pointer ${
              selected
                ? "border-brand-teal bg-brand-teal/5"
                : "border-gray-100 bg-white hover:border-gray-200"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 text-xs font-semibold ${
                  validated === total && total > 0
                    ? "bg-green-100 text-green-700"
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
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${rejected > 0 ? "bg-orange-400" : "bg-brand-teal"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-text-muted font-medium tabular-nums">
                    {validated}/{total}
                  </span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
