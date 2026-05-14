import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { getCompanyDetail } from "@/app/admin/clientes/actions";
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

  const [detail, linkPrefix, hasRenta] = await Promise.all([
    getCompanyDetail(id),
    getLinkPrefix("admin"),
    companyHasRentaService(id),
  ]);

  if (!detail) notFound();
  if (!hasRenta) notFound();

  const displayName = detail.company_name || detail.legal_name;
  const clientHref = `${linkPrefix}/clientes/${id}?tab=informes`;

  return (
    <div className="px-8 py-8 space-y-6">
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
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
            {displayName}
          </p>
          <h1 className="text-2xl font-semibold text-brand-navy">
            Declaración de la renta
          </h1>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Gestiona los DNIs autorizados, el enlace público del formulario y
            los envíos recibidos de los familiares.
          </p>
        </div>
      </div>

      {/* Panel completo */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <RentaAdminPanel companyId={id} />
      </section>
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
