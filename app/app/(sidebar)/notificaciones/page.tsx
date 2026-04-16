import { getNotifications } from "@/lib/actions/notifications";
import { getLinkPrefix } from "@/lib/link-prefix";
import NotificationsPage from "@/components/notifications-page";

export default async function AppNotificacionesPage() {
  const [prefix, notifications] = await Promise.all([
    getLinkPrefix("app"),
    getNotifications(),
  ]);
  return <NotificationsPage initialNotifications={notifications} linkPrefix={prefix} />;
}
