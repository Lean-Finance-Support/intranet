import { headers } from "next/headers";
import { getNotifications } from "@/lib/actions/notifications";
import NotificationsPage from "@/components/notifications-page";

export default async function AdminNotificacionesPage() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  const notifications = await getNotifications();
  return <NotificationsPage initialNotifications={notifications} linkPrefix={prefix} />;
}
