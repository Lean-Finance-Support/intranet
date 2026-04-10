import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/sidebar/admin-sidebar";
import { getNotifications } from "@/lib/actions/notifications";
import {
  getAuthUser,
  getCachedProfile,
  getCachedUserDepartments,
  getCachedDepartmentServiceSlugs,
} from "@/lib/cached-queries";

export default async function AdminSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getAuthUser();
  if (!user) redirect("/admin/login");

  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  const [profile, departments, allNotifications] = await Promise.all([
    getCachedProfile(user.id),
    getCachedUserDepartments(user.id),
    getNotifications(),
  ]);

  const isSuperadmin = profile?.role === "superadmin";

  let hasTaxModels = isSuperadmin;
  let hasEnisaDocs = isSuperadmin;
  if (!isSuperadmin) {
    const deptIds = departments.map((d) => d.id);
    if (deptIds.length > 0) {
      const slugs = await getCachedDepartmentServiceSlugs(deptIds);
      hasTaxModels = slugs.includes("tax-models");
      hasEnisaDocs = slugs.includes("enisa-docs");
    }
  }

  const unreadCount = allNotifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-gray">
      <AdminSidebar
        profile={{
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? user.email ?? null,
        }}
        hasTaxModels={hasTaxModels}
        hasEnisaDocs={hasEnisaDocs}
        loginPath={`${prefix}/login`}
        linkPrefix={prefix}
        unreadCount={unreadCount}
      />
      <main className="flex-1 overflow-y-auto pb-14 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
