import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getActiveCompanyId } from "@/lib/active-company";
import {
  getAuthUser,
  getCachedCompanyServiceSlugs,
  getCachedProfile,
  getCachedUserCompanies,
} from "@/lib/cached-queries";
import DashboardFiscalSection from "@/components/dashboard/dashboard-fiscal-section";
import DashboardFiscalSkeleton from "@/components/dashboard/dashboard-fiscal-skeleton";
import { SERVICE_SLUGS } from "@/lib/types/services";

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

interface PageProps {
  searchParams: Promise<{ period?: string; bank?: string; view?: string }>;
}

export default async function ClientDashboardPage({ searchParams }: PageProps) {
  const { user } = await getAuthUser();
  if (!user) redirect("/login");

  // Los datos del saludo (profile, companies, activeCompanyId) ya vienen
  // cacheados desde el layout, así que pintamos el header inmediatamente.
  // El bloque del dashboard fiscal — que puede esperar varios segundos a
  // Google Sheets cuando se vacía el caché de 24h — va dentro de <Suspense>
  // para que el header haga LCP rápido y el resto streamee.
  const [profile, activeCompanyId, companies, params] = await Promise.all([
    getCachedProfile(user.id),
    getActiveCompanyId(),
    getCachedUserCompanies(user.id),
    searchParams,
  ]);

  const greeting = getGreeting();
  const firstName = getFirstName(profile?.full_name);
  const displayName = firstName ?? profile?.email ?? user.email;

  const resolvedCompanyId = activeCompanyId ?? companies[0]?.id ?? null;
  const activeCompany =
    companies.find((c) => c.id === resolvedCompanyId) ?? companies[0] ?? null;
  const serviceSlugs = resolvedCompanyId
    ? await getCachedCompanyServiceSlugs(resolvedCompanyId)
    : [];
  const hasDashboard = serviceSlugs.includes(SERVICE_SLUGS.TAX_ACCOUNTING_ADVICE);

  return (
    <div className="px-8 py-12">
      <p className="text-brand-teal text-sm font-medium mb-2">Portal de clientes</p>
      <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
        {greeting}{displayName ? `, ${displayName}` : ""}
      </h1>
      <div className="w-10 h-0.5 bg-brand-teal rounded-full mt-6" />

      {hasDashboard && resolvedCompanyId && activeCompany && (
        <div className="mt-10">
          <Suspense fallback={<DashboardFiscalSkeleton />}>
            <DashboardFiscalSection
              companyId={resolvedCompanyId}
              companyName={activeCompany.company_name || activeCompany.legal_name}
              periodId={params.period}
              bankAccount={params.bank}
              view={params.view}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
