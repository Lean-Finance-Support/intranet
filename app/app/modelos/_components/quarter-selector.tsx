"use client";

const QUARTERS = [
  { value: 1, label: "1T 2026" },
  { value: 2, label: "2T 2026" },
  { value: 3, label: "3T 2026" },
  { value: 4, label: "4T 2026" },
];

interface QuarterSelectorProps {
  selected: number;
  onChange: (quarter: number) => void;
}

export default function QuarterSelector({ selected, onChange }: QuarterSelectorProps) {
  return (
    <div className="inline-flex rounded-xl bg-gray-100 p-1">
      {QUARTERS.map((q) => (
        <button
          key={q.value}
          onClick={() => onChange(q.value)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            selected === q.value
              ? "bg-white text-brand-navy shadow-sm"
              : "text-text-muted hover:text-text-body"
          }`}
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}
