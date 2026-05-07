"use client";

import { useState } from "react";

export interface DashboardDetailRow {
  cells: string[];
  details: { date: string; cells: string[] }[];
}

interface Props {
  title: string;
  headers: string[];
  rows: DashboardDetailRow[];
}

const PREVIEW_ROWS = 20;

export default function DashboardDetailTable({ title, headers, rows }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const visible = rows.slice(0, PREVIEW_ROWS);
  const hidden = rows.length - visible.length;

  // Sub-tabla: misma estructura de headers pero con "Fecha" prepended.
  // Recibimos los headers principales en `headers` (Cliente / Subtotal / Total / Cobrado / Estado)
  // y para los details mostramos: Fecha | Subtotal | Total | Cobrado/Pagado | Estado
  // (la primera columna de la fila padre — cliente/proveedor — la sustituimos por la fecha).
  const subHeaders = ["Fecha", ...headers.slice(1)];

  function toggle(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  return (
    <article className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
      </div>
      {visible.length === 0 ? (
        <p className="px-5 py-4 text-xs text-text-muted italic">Sin entradas en este periodo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-text-muted">
                <th className="w-6 px-2 py-2" aria-hidden="true" />
                {headers.map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2 font-medium text-left ${
                      i > 0 && i < headers.length - 1 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((row, idx) => {
                const isExpanded = expanded.has(idx);
                const canExpand = row.details.length > 1;
                return (
                  <RowWithDetails
                    key={idx}
                    row={row}
                    isExpanded={isExpanded}
                    canExpand={canExpand}
                    onToggle={() => toggle(idx)}
                    subHeaders={subHeaders}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {hidden > 0 && (
        <p className="px-5 py-2 text-[11px] text-text-muted bg-gray-50/50 border-t border-gray-100">
          Mostrando {visible.length} de {rows.length} filas. Consulta el detalle completo en tu Sheet
          (a través de tu asesor).
        </p>
      )}
    </article>
  );
}

function RowWithDetails({
  row,
  isExpanded,
  canExpand,
  onToggle,
  subHeaders,
}: {
  row: DashboardDetailRow;
  isExpanded: boolean;
  canExpand: boolean;
  onToggle: () => void;
  subHeaders: string[];
}) {
  const totalCols = 1 + row.cells.length; // chevron + N cells

  return (
    <>
      <tr
        className={`${canExpand ? "cursor-pointer" : ""} hover:bg-gray-50/60 transition-colors`}
        onClick={canExpand ? onToggle : undefined}
        aria-expanded={canExpand ? isExpanded : undefined}
      >
        <td className="w-6 px-2 py-2 align-middle">
          {canExpand ? (
            <svg
              className={`w-3.5 h-3.5 text-text-muted transition-transform duration-150 ${
                isExpanded ? "rotate-90" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          ) : null}
        </td>
        {row.cells.map((cell, i) => {
          const isNumeric = i > 0 && i < row.cells.length - 1;
          return (
            <td
              key={i}
              className={`px-3 py-2 ${
                isNumeric ? "text-right tabular-nums" : "text-text-body"
              }`}
            >
              {cell || "—"}
            </td>
          );
        })}
      </tr>
      {isExpanded && row.details.length > 0 && (
        <tr className="bg-gray-50/50">
          <td className="p-0" colSpan={totalCols}>
            <div className="border-l-2 border-brand-teal/30 ml-2 my-1">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-text-muted/80">
                    {subHeaders.map((h, i) => (
                      <th
                        key={h}
                        className={`px-3 py-1.5 font-medium text-left ${
                          i > 0 && i < subHeaders.length - 1 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {row.details.map((d, di) => {
                    const cells = [d.date, ...d.cells];
                    return (
                      <tr key={di} className="border-t border-gray-200/60">
                        {cells.map((cell, i) => {
                          const isNumeric = i > 0 && i < cells.length - 1;
                          return (
                            <td
                              key={i}
                              className={`px-3 py-1.5 ${
                                isNumeric
                                  ? "text-right tabular-nums text-text-body"
                                  : "text-text-body"
                              }`}
                            >
                              {cell || "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
