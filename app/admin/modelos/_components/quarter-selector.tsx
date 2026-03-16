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
    <div className="flex gap-2">
      {QUARTERS.map((q) => (
        <button
          key={q.value}
          onClick={() => onChange(q.value)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            selected === q.value
              ? "bg-brand-teal text-white"
              : "bg-gray-100 text-text-body hover:bg-gray-200"
          }`}
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}
