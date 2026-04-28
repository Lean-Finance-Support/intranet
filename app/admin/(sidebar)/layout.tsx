import { redirect } from "next/navigation";
import AdminSidebar from "@/components/sidebar/admin-sidebar";
import { getNotifications } from "@/lib/actions/notifications";
import { getLinkPrefix } from "@/lib/link-prefix";
import {
  getAuthUser,
  getCachedProfile,
  getCachedUserServiceDepts,
  getCachedDepartmentServiceSlugs,
} from "@/lib/cached-queries";
import { hasPermission, userScopeIds } from "@/lib/require-permission";

export default async function AdminSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getAuthUser();
  if (!user) redirect("/admin/login");

  const [prefix, profile, departments, allNotifications] = await Promise.all([
    getLinkPrefix("admin"),
    getCachedProfile(user.id),
    getCachedUserServiceDepts(user.id),
    getNotifications(),
  ]);

  const deptIds = departments.map((d) => d.id);
  const slugs = deptIds.length > 0 ? await getCachedDepartmentServiceSlugs(deptIds) : [];
  const hasTaxModels = slugs.includes("tax-models");

  const [canManageDocCatalogGlobal, docCatalogScopes] = await Promise.all([
    hasPermission("manage_documentation_catalog"),
    userScopeIds("manage_documentation_catalog", "department"),
  ]);
  const canManageDocCatalog = canManageDocCatalogGlobal || docCatalogScopes.length > 0;

  const unreadCount = allNotifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-gray">
      <AdminSidebar
        profile={{
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? user.email ?? null,
        }}
        hasTaxModels={hasTaxModels}
        canManageDocCatalog={canManageDocCatalog}
        loginPath={`${prefix}/login`}
        linkPrefix={prefix}
        userId={user.id}
        unreadCount={unreadCount}
      />
      <main className="flex-1 overflow-y-auto pb-14 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
