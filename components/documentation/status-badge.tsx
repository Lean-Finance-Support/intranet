import type { ApartadoStatus } from "@/lib/types/documentation";

type StatusVariant = "default" | "client";

const CLASSES: Record<ApartadoStatus, string> = {
  pendiente: "bg-status-pending text-status-pending-fg",
  enviado: "bg-orange-100 text-status-review",
  validado: "bg-green-100 text-status-validated",
  rechazado: "bg-red-100 text-status-rejected",
};

const LABELS: Record<StatusVariant, Record<ApartadoStatus, string>> = {
  default: {
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

export default function StatusBadge({
  status,
  size = "sm",
  variant = "default",
}: {
  status: ApartadoStatus;
  size?: "xs" | "sm";
  variant?: StatusVariant;
}) {
  const sizeCls =
    size === "xs"
      ? "text-[10px] px-1.5 py-0.5"
      : "text-xs px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center rounded-md font-medium ${sizeCls} ${CLASSES[status]}`}
    >
      {LABELS[variant][status]}
    </span>
  );
}
