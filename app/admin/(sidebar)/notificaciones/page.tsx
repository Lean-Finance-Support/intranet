import { getNotifications } from "@/lib/actions/notifications";
import { getLinkPrefix } from "@/lib/link-prefix";
import NotificationsPage from "@/components/notifications-page";

export default async function AdminNotificacionesPage() {
  const [prefix, notifications] = await Promise.all([
    getLinkPrefix("admin"),
    getNotifications(),
  ]);
  return <NotificationsPage initialNotifications={notifications} linkPrefix={prefix} />;
}
