import type { ApartadoStatus } from "@/lib/types/documentation";

const STATUS_STYLES: Record<ApartadoStatus, { label: string; classes: string }> = {
  pendiente: {
    label: "Pendiente",
    classes: "bg-gray-100 text-text-muted",
  },
  enviado: {
    label: "En revisión",
    classes: "bg-brand-teal/10 text-brand-teal",
  },
  validado: {
    label: "Validado",
    classes: "bg-green-100 text-green-700",
  },
  rechazado: {
    label: "Rechazado",
    classes: "bg-red-100 text-red-600",
  },
};

export default function StatusBadge({
  status,
  size = "sm",
}: {
  status: ApartadoStatus;
  size?: "xs" | "sm";
}) {
  const cfg = STATUS_STYLES[status];
  const sizeCls =
    size === "xs"
      ? "text-[10px] px-1.5 py-0.5"
      : "text-xs px-2 py-0.5";
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeCls} ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}
