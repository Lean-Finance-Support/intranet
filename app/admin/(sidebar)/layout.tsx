import { redirect } from "next/navigation";
import AdminSidebar from "@/components/sidebar/admin-sidebar";
import SearchProvider from "@/components/search/search-provider";
import { getNotifications } from "@/lib/actions/notifications";
import { getSearchableCompanies } from "@/lib/actions/search";
import { getLinkPrefix } from "@/lib/link-prefix";
import { hasPermission } from "@/lib/require-permission";
import { canViewClientDashboard } from "@/lib/dashboard-admin-access";
import {
  getAuthUser,
  getCachedProfile,
  getCachedUserServiceDepts,
  getCachedDepartmentServiceSlugs,
} from "@/lib/cached-queries";
import { SERVICE_SLUGS } from "@/lib/types/services";
export default async function AdminSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getAuthUser();
  if (!user) redirect("/admin/login");

  const [
    prefix,
    profile,
    departments,
    allNotifications,
    searchableCompanies,
    canViewDashboard,
    canCreateCompany,
    canManageClientAccounts,
    canRequestDocumentation,
  ] = await Promise.all([
    getLinkPrefix("admin"),
    getCachedProfile(user.id),
    getCachedUserServiceDepts(user.id),
    getNotifications(),
    getSearchableCompanies(),
    canViewClientDashboard(),
    hasPermission("create_company"),
    hasPermission("manage_client_accounts"),
    hasPermission("request_client_documentation"),
  ]);

  const deptIds = departments.map((d) => d.id);
  const slugs = deptIds.length > 0 ? await getCachedDepartmentServiceSlugs(deptIds) : [];
  const hasTaxModels = slugs.includes(SERVICE_SLUGS.TAX_ACCOUNTING_ADVICE);
  // Onboarding requiere los 3 permisos globales (ver CLAUDE.md sección "Onboarding").
  const canCreateOnboarding =
    canCreateCompany && canManageClientAccounts && canRequestDocumentation;

  const unreadCount = allNotifications.filter((n) => !n.is_read).length;

  return (
    <SearchProvider
      ctx={{
        space: "admin",
        linkPrefix: prefix,
        role: "admin",
        hasTaxModels,
        hasDashboard: false,
        hasDeclaracionRenta: false,
        canViewClientDashboard: canViewDashboard,
        canCreateOnboarding,
        canRequestDocumentation,
        companies: searchableCompanies,
        activeCompanyId: null,
      }}
    >
      <div className="flex h-screen overflow-hidden bg-surface-gray">
        <AdminSidebar
          profile={{
            full_name: profile?.full_name ?? null,
            email: profile?.email ?? user.email ?? null,
          }}
          hasTaxModels={hasTaxModels}
          loginPath={`${prefix}/login`}
          linkPrefix={prefix}
          userId={user.id}
          unreadCount={unreadCount}
        />
        <main className="flex-1 overflow-y-auto pb-14 lg:pb-0">
          {children}
        </main>
      </div>
    </SearchProvider>
  );
}
