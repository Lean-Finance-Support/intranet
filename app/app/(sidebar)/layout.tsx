import { redirect } from "next/navigation";
import ClientSidebar from "@/components/sidebar/client-sidebar";
import SearchProvider from "@/components/search/search-provider";
import { getNotifications } from "@/lib/actions/notifications";
import { getActiveCompanyId } from "@/lib/active-company";
import { getLinkPrefix } from "@/lib/link-prefix";
import type { SearchableCompany } from "@/lib/search/types";
import {
  getAuthUser,
  getCachedProfile,
  getCachedUserCompanies,
  getCachedCompanyServiceSlugs,
} from "@/lib/cached-queries";
import { SERVICE_SLUGS } from "@/lib/types/services";

export default async function AppSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getAuthUser();
  if (!user) redirect("/app/login");

  const [prefix, activeCompanyId, profile, companies, allNotifications] = await Promise.all([
    getLinkPrefix("app"),
    getActiveCompanyId(),
    getCachedProfile(user.id),
    getCachedUserCompanies(user.id),
    getNotifications(),
  ]);

  // Si no hay empresa activa, redirigir para que se setee la cookie
  if (!activeCompanyId) {
    if (companies.length === 1) {
      redirect(`${prefix}/set-company?companyId=${companies[0].id}&next=${prefix}/dashboard`);
    } else if (companies.length === 0) {
      redirect("/unauthorized");
    } else {
      redirect(`${prefix}/select-company`);
    }
  }

  const resolvedCompanyId = activeCompanyId ?? companies[0]?.id;

  const serviceSlugs = resolvedCompanyId
    ? await getCachedCompanyServiceSlugs(resolvedCompanyId)
    : [];

  const hasTaxModels = serviceSlugs.includes(SERVICE_SLUGS.TAX_ACCOUNTING_ADVICE);
  const hasDashboard = serviceSlugs.includes(SERVICE_SLUGS.TAX_ACCOUNTING_ADVICE);
  const unreadCount = allNotifications.filter((n) => !n.is_read).length;
  const activeCompany = companies.find((c) => c.id === resolvedCompanyId) ?? companies[0] ?? null;

  const searchableCompanies: SearchableCompany[] = companies.map((c) => ({
    id: c.id,
    legal_name: c.legal_name,
    company_name: c.company_name,
    has_dashboard_service: false,
    has_tax_models_service: false,
    has_declaracion_renta_service: false,
  }));

  return (
    <SearchProvider
      ctx={{
        space: "client",
        linkPrefix: prefix,
        role: "client",
        hasTaxModels,
        hasDashboard,
        canViewClientDashboard: false,
        canCreateOnboarding: false,
        canRequestDocumentation: false,
        companies: searchableCompanies,
        activeCompanyId: resolvedCompanyId ?? null,
      }}
    >
      <div className="flex h-screen overflow-hidden bg-surface-gray">
        <ClientSidebar
          profile={{
            full_name: profile?.full_name ?? null,
            email: profile?.email ?? user.email ?? null,
          }}
          hasTaxModels={hasTaxModels}
          hasDashboard={hasDashboard}
          loginPath={`${prefix}/login`}
          linkPrefix={prefix}
          userId={user.id}
          unreadCount={unreadCount}
          companies={companies}
          activeCompany={activeCompany}
        />
        <main className="flex-1 overflow-y-auto pb-14 lg:pb-0">
          {children}
        </main>
      </div>
    </SearchProvider>
  );
}
