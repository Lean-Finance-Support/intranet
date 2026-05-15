"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invalidateNotifications } from "@/lib/actions/notifications";

// Mantiene el contador de notificaciones sin leer sincronizado con la BD.
// - Valor inicial: SSR (cookies frescas vía middleware), no se refetcha al
//   montar.
// - Eventos Realtime: actualizan el contador desde el payload (INSERT no
//   leídas → +1; UPDATE a is_read=true → -1). Evita un round-trip extra y
//   sortea el caché de `getNotifications` (TTL 60 s, ver
//   `lib/actions/notifications.ts`). Además invalida el tag para que el
//   próximo SSR / apertura del drawer reciba datos frescos (cubre inserciones
//   desde DB triggers / edge functions, que no pueden invocar revalidateTag).
export function useUnreadNotifications(
  userId: string | null,
  initialCount: number,
): number {
  const [count, setCount] = useState(initialCount);

  // Reset cuando cambia el initialCount (p.ej. al navegar a otra ruta dentro
  // del mismo espacio: el SSR del nuevo layout es el valor correcto).
  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();

    // Throttle de invalidaciones de tag (cubre ráfagas de eventos: si llegan
    // varias notifs seguidas no invalidamos varias veces por segundo).
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleInvalidate = () => {
      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
        invalidateTimer = null;
        invalidateNotifications([userId]).catch(() => {});
      }, 500);
    };

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { is_read?: boolean } | undefined;
          if (row && row.is_read === false) {
            setCount((c) => c + 1);
          }
          scheduleInvalidate();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const oldRow = payload.old as { is_read?: boolean } | undefined;
          const newRow = payload.new as { is_read?: boolean } | undefined;
          if (oldRow?.is_read === false && newRow?.is_read === true) {
            setCount((c) => Math.max(0, c - 1));
          } else if (oldRow?.is_read === true && newRow?.is_read === false) {
            setCount((c) => c + 1);
          }
          scheduleInvalidate();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.old as { is_read?: boolean } | undefined;
          if (row?.is_read === false) {
            setCount((c) => Math.max(0, c - 1));
          }
          scheduleInvalidate();
        },
      )
      .subscribe();

    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
