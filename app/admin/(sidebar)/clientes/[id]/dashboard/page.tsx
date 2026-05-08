import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { canViewClientDashboard } from "@/lib/dashboard-admin-access";
import {
  getCompanyDashboardConfig,
  getCompanyDetail,
} from "@/app/admin/clientes/actions";
import { getLinkPrefix } from "@/lib/link-prefix";
import DashboardFiscalSection from "@/components/dashboard/dashboard-fiscal-section";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; bank?: string; view?: string }>;
}

export default async function AdminClientDashboardPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const [allowed, detail, dashboardConfig, linkPrefix, sp] = await Promise.all([
    canViewClientDashboard(),
    getCompanyDetail(id),
    getCompanyDashboardConfig(id),
    getLinkPrefix("admin"),
    searchParams,
  ]);

  if (!allowed) notFound();
  if (!detail) notFound();

  const displayName = detail.company_name || detail.legal_name;
  const showsLegalName = !!detail.company_name && detail.company_name !== detail.legal_name;
  const clientHref = `${linkPrefix}/clientes/${id}?tab=servicios`;

  return (
    <div className="px-8 py-8 space-y-6">
      <nav className="text-xs text-text-muted">
        <Link href={`${linkPrefix}/clientes`} className="hover:text-brand-teal">
          Clientes
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={clientHref} className="hover:text-brand-teal">
          {displayName}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-text-body">Dashboard fiscal</span>
      </nav>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-brand-teal text-xs font-semibold uppercase tracking-wider mb-1">
            Vista admin · Dashboard del cliente
          </p>
          <h1 className="text-2xl font-bold font-heading text-brand-navy tracking-tight">
            {displayName}
          </h1>
          {showsLegalName && (
            <p className="text-sm text-text-muted mt-0.5">{detail.legal_name}</p>
          )}
        </div>
        <Link
          href={clientHref}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-brand-teal transition-colors"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Volver a la ficha del cliente
        </Link>
      </header>

      {!dashboardConfig ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-brand-navy">
            Dashboard fiscal no configurado
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Esta empresa no tiene un Google Sheet vinculado al servicio
            Dashboard. Configúralo desde la ficha del cliente, en la pestaña
            &quot;Servicios contratados&quot;.
          </p>
          <Link
            href={clientHref}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal hover:text-brand-teal/80"
          >
            Ir a Servicios contratados
          </Link>
        </section>
      ) : (
        <DashboardFiscalSection
          companyId={id}
          companyName={displayName}
          periodId={sp.period}
          bankAccount={sp.bank}
          view={sp.view}
        />
      )}
    </div>
  );
}
