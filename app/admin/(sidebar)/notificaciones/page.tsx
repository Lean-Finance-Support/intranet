import { getNotifications } from "@/lib/actions/notifications";
import NotificationsPage from "@/components/notifications-page";

export default async function AdminNotificacionesPage() {
  const notifications = await getNotifications();
  return <NotificationsPage initialNotifications={notifications} />;
}
