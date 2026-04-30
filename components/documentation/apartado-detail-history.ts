import type {
  ApartadoStatus,
  ApartadoStatusHistoryEntry,
} from "@/lib/types/documentation";

export function describeHistoryEntry(h: ApartadoStatusHistoryEntry): string {
  const actor = h.changed_by_name ?? "Alguien";
  const from = h.from_status as ApartadoStatus | null;
  const to = h.to_status;
  if (h.reason === "__event:file_uploaded__") return `${actor} adjuntó documentos`;
  if (h.reason === "__event:reopened__") {
    if (from === "validado")
      return `${actor} reabrió el apartado (revertió la validación)`;
    if (from === "rechazado")
      return `${actor} reabrió el apartado (revertió el rechazo)`;
    return `${actor} reabrió el apartado`;
  }
  if (h.reason === "__event:no_files_left__") {
    return `${actor} eliminó el último archivo (vuelve a pendiente)`;
  }
  if (from === null && to === "pendiente") return `${actor} añadió este apartado`;
  if ((from === "pendiente" || from === null) && to === "enviado") {
    return `${actor} envió documentos para revisión`;
  }
  if (from === "rechazado" && to === "enviado") {
    return `${actor} reenvió documentos tras el rechazo`;
  }
  if (from === "validado" && to === "enviado") {
    return `${actor} reabrió el apartado y subió nuevos documentos`;
  }
  if (to === "validado") return `${actor} validó el apartado`;
  if (to === "rechazado") {
    const motivo = h.reason ? ` — ${h.reason}` : "";
    return `${actor} rechazó el apartado${motivo}`;
  }
  if (to === "pendiente") return `${actor} reinició el apartado`;
  return `${actor} cambió el estado a ${to}`;
}
