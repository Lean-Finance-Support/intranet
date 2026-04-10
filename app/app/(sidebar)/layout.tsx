import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ClientSidebar from "@/components/sidebar/client-sidebar";
import { getNotifications } from "@/lib/actions/notifications";
import { getActiveCompanyId } from "@/lib/active-company";
import {
  getAuthUser,
  getCachedProfile,
  getCachedUserCompanies,
  getCachedCompanyServiceSlugs,
} from "@/lib/cached-queries";

export default async function AppSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getAuthUser();
  if (!user) redirect("/app/login");

  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "app.leanfinance.es";
  const prefix = isProd ? "" : "/app";

  const activeCompanyId = await getActiveCompanyId();

  const [profile, companies, allNotifications] = await Promise.all([
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

  const hasTaxModels = serviceSlugs.includes("tax-models");
  const hasEnisaDocs = serviceSlugs.includes("enisa-docs");
  const unreadCount = allNotifications.filter((n) => !n.is_read).length;
  const activeCompany = companies.find((c) => c.id === resolvedCompanyId) ?? companies[0] ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-gray">
      <ClientSidebar
        profile={{
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? user.email ?? null,
        }}
        hasTaxModels={hasTaxModels}
        hasEnisaDocs={hasEnisaDocs}
        loginPath={`${prefix}/login`}
        linkPrefix={prefix}
        unreadCount={unreadCount}
        companies={companies}
        activeCompany={activeCompany}
      />
      <main className="flex-1 overflow-y-auto pb-14 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
