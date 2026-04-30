type Tone = "neutral" | "teal" | "navy";

const TONES: Record<Tone, { bg: string; fold: string; chip: string; chipBg: string }> = {
  neutral: {
    bg: "#F3F4F6",
    fold: "#E5E7EB",
    chip: "#6B7280",
    chipBg: "rgba(107,114,128,0.12)",
  },
  teal: {
    bg: "rgba(0,176,183,0.07)",
    fold: "rgba(0,176,183,0.18)",
    chip: "#00B0B7",
    chipBg: "rgba(0,176,183,0.15)",
  },
  navy: {
    bg: "rgba(11,19,51,0.05)",
    fold: "rgba(11,19,51,0.15)",
    chip: "#0B1333",
    chipBg: "rgba(11,19,51,0.10)",
  },
};

export function fileExt(name: string): string {
  return (name.split(".").pop() || "").toUpperCase();
}

export default function FileThumbnail({
  size = 36,
  label = "PDF",
  tone = "neutral",
}: {
  size?: number;
  label?: string;
  tone?: Tone;
}) {
  const t = TONES[tone];
  const w = size;
  const h = size * 1.25;
  return (
    <div className="relative flex-shrink-0" style={{ width: w, height: h }}>
      <svg width={w} height={h} viewBox="0 0 40 50" fill="none">
        <path
          d="M4 4a3 3 0 013-3h21l9 9v36a3 3 0 01-3 3H7a3 3 0 01-3-3V4z"
          fill={t.bg}
          stroke="rgba(11,19,51,0.10)"
          strokeWidth="0.8"
        />
        <path
          d="M28 1v6a3 3 0 003 3h6"
          stroke={t.fold}
          strokeWidth="0.8"
          fill="none"
        />
        <line x1="9" y1="22" x2="31" y2="22" stroke="rgba(11,19,51,0.10)" strokeWidth="0.8" strokeLinecap="round" />
        <line x1="9" y1="27" x2="31" y2="27" stroke="rgba(11,19,51,0.10)" strokeWidth="0.8" strokeLinecap="round" />
        <line x1="9" y1="32" x2="24" y2="32" stroke="rgba(11,19,51,0.10)" strokeWidth="0.8" strokeLinecap="round" />
      </svg>
      <span
        className="absolute bottom-1 left-1 text-[7px] font-bold px-1 py-[1px] rounded tracking-wider"
        style={{ color: t.chip, backgroundColor: t.chipBg }}
      >
        {label.slice(0, 4)}
      </span>
    </div>
  );
}
