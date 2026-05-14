import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { getCompanyDetail } from "@/app/admin/clientes/actions";
import { getRentaSummary } from "@/app/admin/clientes/[id]/renta-actions";
import { getLinkPrefix } from "@/lib/link-prefix";
import { SERVICE_SLUGS } from "@/lib/types/services";
import RentaAdminPanel from "@/components/clients/renta-admin-panel";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Página dedicada al servicio "Declaración de la renta" de un cliente.
 * Sigue el mismo patrón que `/admin/clientes/[id]/dashboard`: shell con
 * breadcrumb + título + botón "volver", y body con el panel completo.
 */
export default async function AdminClientRentaPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const [detail, linkPrefix, hasRenta, summary] = await Promise.all([
    getCompanyDetail(id),
    getLinkPrefix("admin"),
    companyHasRentaService(id),
    getRentaSummary(id),
  ]);

  if (!detail) notFound();
  if (!hasRenta) notFound();

  const displayName = detail.company_name || detail.legal_name;
  const clientHref = `${linkPrefix}/clientes/${id}?tab=informes`;

  const totalSubmissions =
    summary.pendingCount + summary.reviewedCount + summary.revokedCount;

  return (
    <div className="px-8 py-8 space-y-6 max-w-6xl mx-auto">
      {/* Breadcrumb + volver */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <nav className="text-xs text-text-muted">
          <Link href={`${linkPrefix}/clientes`} className="hover:text-brand-teal">
            Clientes
          </Link>
          <span className="mx-1.5">/</span>
          <Link href={clientHref} className="hover:text-brand-teal">
            {displayName}
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-text-body">Declaración de la renta</span>
        </nav>
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
      </div>

      {/* Header de página */}
      <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-brand-teal/[0.04] shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              {displayName}
            </p>
            <h1 className="text-2xl font-semibold text-brand-navy">
              Declaración de la renta
            </h1>
            <p className="text-sm text-text-muted mt-2 max-w-2xl leading-relaxed">
              Gestiona los DNIs autorizados, el enlace público y los envíos
              recibidos del formulario de deducciones autonómicas.
            </p>
          </div>
        </div>

        {/* KPIs */}
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile
            label="DNIs autorizados"
            value={summary.filersCount}
            tone="navy"
          />
          <KpiTile
            label="Envíos pendientes"
            value={summary.pendingCount}
            tone={summary.pendingCount > 0 ? "amber" : "muted"}
            hint={
              totalSubmissions > 0
                ? `de ${totalSubmissions} recibidos`
                : undefined
            }
          />
          <KpiTile
            label="Envíos revisados"
            value={summary.reviewedCount}
            tone={summary.reviewedCount > 0 ? "emerald" : "muted"}
          />
          <KpiTile
            label="Enlace público"
            value={summary.hasActiveInvitation ? "Activo" : "Inactivo"}
            tone={summary.hasActiveInvitation ? "teal" : "muted"}
          />
        </dl>
      </div>

      {/* Panel completo */}
      <RentaAdminPanel companyId={id} />
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  tone: "navy" | "teal" | "amber" | "emerald" | "muted";
  hint?: string;
}) {
  const toneClass = {
    navy: "text-brand-navy",
    teal: "text-brand-teal",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
    muted: "text-text-muted",
  }[tone];

  const dotClass = {
    navy: "bg-brand-navy",
    teal: "bg-brand-teal",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    muted: "bg-gray-300",
  }[tone];

  return (
    <div className="rounded-xl bg-white border border-gray-100 px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden />
        <dt className="text-[10px] uppercase tracking-wider font-medium text-text-muted">
          {label}
        </dt>
      </div>
      <dd className={`mt-1 text-2xl font-semibold leading-none ${toneClass}`}>
        {value}
      </dd>
      {hint && (
        <p className="mt-1 text-[11px] text-text-muted/80">{hint}</p>
      )}
    </div>
  );
}

async function companyHasRentaService(companyId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("company_services")
    .select("services!inner(slug)")
    .eq("company_id", companyId)
    .eq("services.slug", SERVICE_SLUGS.DECLARACION_RENTA)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
