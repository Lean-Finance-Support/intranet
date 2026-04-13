"use client";

import { useState, type ReactNode } from "react";

type Tone = "red" | "amber" | "blue" | "green";

interface StatusAccordionProps {
  title: string;
  count: number;
  tone: Tone;
  defaultOpen?: boolean;
  children: ReactNode;
}

const toneClasses: Record<Tone, { dot: string; badge: string }> = {
  red: { dot: "bg-red-500", badge: "bg-red-50 text-red-700" },
  amber: { dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
  blue: { dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700" },
  green: { dot: "bg-green-500", badge: "bg-green-50 text-green-700" },
};

export default function StatusAccordion({
  title,
  count,
  tone,
  defaultOpen = false,
  children,
}: StatusAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const empty = count === 0;
  const classes = toneClasses[tone];

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col lg:h-full">
      <button
        type="button"
        onClick={() => !empty && setOpen((v) => !v)}
        disabled={empty}
        className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-colors lg:cursor-default lg:hover:bg-transparent ${
          empty ? "cursor-default opacity-60" : "hover:bg-gray-50 cursor-pointer"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${classes.dot}`} />
          <span className="font-semibold text-brand-navy truncate">{title}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${classes.badge}`}>
            {count}
          </span>
        </div>
        {!empty && (
          <svg
            className={`w-5 h-5 text-text-muted transition-transform lg:hidden ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      <div
        className={`border-t border-gray-100 p-4 space-y-4 bg-gray-50/50 flex-1 ${
          open && !empty ? "block" : "hidden"
        } lg:block ${empty ? "lg:opacity-40" : ""}`}
      >
        {empty ? (
          <p className="hidden lg:block text-xs text-text-muted italic text-center py-2">
            Sin elementos
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
