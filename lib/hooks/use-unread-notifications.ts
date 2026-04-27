"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getNotifications } from "@/lib/actions/notifications";

// Mantiene el contador de notificaciones sin leer sincronizado con la BD via
// Supabase Realtime, con un fetch inicial al montar como fallback al SSR hint
// (cubre el caso de cookies de sesión recién establecidas tras el login).
export function useUnreadNotifications(
  userId: string | null,
  initialCount: number,
): number {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const supabase = createClient();

    const refresh = async () => {
      const list = await getNotifications();
      if (cancelled) return;
      setCount(list.filter((n) => !n.is_read).length);
    };

    refresh();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          refresh();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
