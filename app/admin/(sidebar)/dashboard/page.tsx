import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getAuthUser,
  getCachedProfile,
  getCachedUserDepartments,
} from "@/lib/cached-queries";
import { getNotifications } from "@/lib/actions/notifications";
import DashboardNotificationsPanel from "@/components/dashboard-notifications-panel";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function getFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  return fullName.split(" ")[0];
}

export default async function AdminDashboardPage() {
  const { user } = await getAuthUser();
  if (!user) redirect("/login");

  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const prefix = host === "admin.leanfinance.es" ? "" : "/admin";

  const [profile, departments, notifications] = await Promise.all([
    getCachedProfile(user.id),
    getCachedUserDepartments(user.id),
    getNotifications(),
  ]);

  const greeting = getGreeting();
  const firstName = getFirstName(profile?.full_name);
  const displayName = firstName ?? profile?.email ?? user.email;

  return (
    <div className="flex h-full">
      {/* Left: main content */}
      <div className="flex-1 min-w-0 overflow-y-auto px-8 py-12">
        <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
        <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
          {greeting}{displayName ? `, ${displayName}` : ""}
        </h1>
        {departments.length > 0 && (
          <p className="text-text-muted text-sm mt-2">
            {departments.map((d) => d.name).join(" · ")}
          </p>
        )}
        <div className="w-10 h-0.5 bg-brand-teal rounded-full mt-6" />
      </div>

      {/* Divider (desktop only) */}
      <div className="hidden lg:block w-px bg-gray-200 flex-shrink-0" />

      {/* Right: notifications (desktop only — en mobile se accede desde la barra inferior) */}
      <div className="hidden lg:flex flex-1 flex-col h-full">
        <DashboardNotificationsPanel initialNotifications={notifications} linkPrefix={prefix} />
      </div>
    </div>
  );
}
