"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/cached-queries";
import { getActiveCompanyId } from "@/lib/active-company";
import type { Notification } from "@/lib/types/notifications";

// Caché 60 s con invalidación por tag. La fuente de verdad para latencia baja
// es el canal Realtime del cliente — el caché protege del SSR repetido en
// cada navegación. revalidateTag se llama al marcar como leído, al insertar
// notificaciones desde server actions, y desde el cliente cuando Realtime
// recibe un evento ajeno (DB trigger / edge function).
async function fetchNotifications(
  userId: string,
  activeCompanyId: string | null,
): Promise<Notification[]> {
  const admin = createAdminClient();

  let query = admin
    .from("notifications")
    .select("id, recipient_id, company_id, title, message, link, is_read, created_at")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (activeCompanyId) {
    query = query.or(`company_id.eq.${activeCompanyId},company_id.is.null`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[notifications] fetch error:", error);
    return [];
  }
  return data ?? [];
}

function getCachedNotifications(
  userId: string,
  activeCompanyId: string | null,
): Promise<Notification[]> {
  const companyKey = activeCompanyId ?? "_none";
  return unstable_cache(
    async () => fetchNotifications(userId, activeCompanyId),
    ["notifications", userId, companyKey],
    { tags: [`notifs:${userId}`], revalidate: 60 },
  )();
}

export async function getNotifications(): Promise<Notification[]> {
  const { user } = await getAuthUser();
  if (!user) return [];
  const activeCompanyId = await getActiveCompanyId();
  return getCachedNotifications(user.id, activeCompanyId);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { supabase, user } = await getAuthUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("recipient_id", user.id);

  revalidateTag(`notifs:${user.id}`, { expire: 0 });
}

export async function markAllNotificationsRead(): Promise<void> {
  const { supabase, user } = await getAuthUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_id", user.id)
    .eq("is_read", false);

  revalidateTag(`notifs:${user.id}`, { expire: 0 });
}

/**
 * Invalida el caché de notificaciones para un conjunto de destinatarios.
 * Las server actions que insertan notificaciones deben llamar a esto tras
 * el insert. Para inserciones desde DB triggers / edge functions, el cliente
 * lo invoca al recibir el evento Realtime correspondiente (ver
 * `useUnreadNotifications`).
 */
export async function invalidateNotifications(recipientIds: string[]): Promise<void> {
  for (const id of recipientIds) {
    if (!id) continue;
    revalidateTag(`notifs:${id}`, { expire: 0 });
  }
}
