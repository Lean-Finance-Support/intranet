import type { ApartadoStatus } from "@/lib/types/documentation";

const STATUS_STYLE: Record<
  ApartadoStatus,
  { color: string; bg: string; border: string; dot: string }
> = {
  validado: {
    color: "#00B0B7",
    bg: "rgba(0,176,183,0.10)",
    border: "rgba(0,176,183,0.28)",
    dot: "#00B0B7",
  },
  enviado: {
    color: "#005175",
    bg: "rgba(0,81,117,0.08)",
    border: "rgba(0,81,117,0.25)",
    dot: "#005175",
  },
  pendiente: {
    color: "#54595F",
    bg: "rgba(84,89,95,0.06)",
    border: "rgba(84,89,95,0.20)",
    dot: "#9CA3AF",
  },
  rechazado: {
    color: "#B91C1C",
    bg: "rgba(185,28,28,0.07)",
    border: "rgba(185,28,28,0.20)",
    dot: "#B91C1C",
  },
};

type StatusVariant = "admin" | "client";

const LABELS: Record<StatusVariant, Record<ApartadoStatus, string>> = {
  admin: {
    pendiente: "Pendiente",
    enviado: "A revisar",
    validado: "Validado",
    rechazado: "Rechazado",
  },
  client: {
    pendiente: "Pendiente",
    enviado: "En revisión",
    validado: "Validado",
    rechazado: "Rechazado",
  },
};

export function statusLabel(
  status: ApartadoStatus,
  variant: StatusVariant = "admin"
): string {
  return LABELS[variant][status];
}

export default function StatusBadge({
  status,
  size = "sm",
  variant = "admin",
}: {
  status: ApartadoStatus;
  size?: "xs" | "sm";
  variant?: StatusVariant;
}) {
  const style = STATUS_STYLE[status];
  const sizeCls =
    size === "xs"
      ? "px-1.5 py-[2px] text-[10px]"
      : "px-2 py-[3px] text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${sizeCls}`}
      style={{
        color: style.color,
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: style.dot }}
      />
      {LABELS[variant][status]}
    </span>
  );
}

export function statusDotColor(status: ApartadoStatus): string {
  return STATUS_STYLE[status].dot;
}

export function statusColor(status: ApartadoStatus): string {
  return STATUS_STYLE[status].color;
}
