import { headers } from "next/headers";
import { getNotifications } from "@/lib/actions/notifications";
import NotificationsPage from "@/components/notifications-page";

export default async function AppNotificacionesPage() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "app.leanfinance.es";
  const prefix = isProd ? "" : "/app";

  const notifications = await getNotifications();
  return <NotificationsPage initialNotifications={notifications} linkPrefix={prefix} />;
}
