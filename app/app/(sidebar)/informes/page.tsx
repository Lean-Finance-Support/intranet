import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getAuthUser,
  getCachedCompanyServiceSlugs,
} from "@/lib/cached-queries";
import { getActiveCompanyId } from "@/lib/active-company";
import { getLinkPrefix } from "@/lib/link-prefix";
import { SERVICE_SLUGS } from "@/lib/types/services";

/**
 * Índice del módulo "Informes / Formularios" del portal cliente.
 *
 * Hoy solo expone "Declaración de la renta". A medida que se sumen más
 * informes/formularios entregables se irán añadiendo aquí como tarjetas.
 */
export default async function ClientInformesIndexPage() {
  const { user } = await getAuthUser();
  if (!user) redirect("/app/login");

  const [prefix, activeCompanyId] = await Promise.all([
    getLinkPrefix("app"),
    getActiveCompanyId(),
  ]);
  if (!activeCompanyId) redirect(`${prefix}/select-company`);

  const slugs = await getCachedCompanyServiceSlugs(activeCompanyId);
  const hasDeclaracionRenta = slugs.includes(SERVICE_SLUGS.DECLARACION_RENTA);

  return (
    <div className="px-4 sm:px-8 pt-12 pb-12">
      <div className="max-w-4xl mx-auto">
        <p className="text-brand-teal text-sm font-medium mb-2">
          Portal de clientes
        </p>
        <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
          Informes / Formularios
        </h1>
        <p className="mt-3 text-sm text-text-muted max-w-2xl">
          Formularios e informes puntuales que tu asesor habilita para tu
          empresa. Aquí encontrarás el enlace público que tus familiares o
          empleados deben usar para rellenar sus datos, y un resumen de los
          envíos recibidos.
        </p>
        <div className="w-10 h-0.5 bg-brand-teal rounded-full mt-6 mb-10" />

        {hasDeclaracionRenta ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href={`${prefix}/informes/renta`}
              className="group block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-brand-teal/40 transition-all p-6"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-brand-teal/10 flex items-center justify-center text-brand-teal">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-brand-navy group-hover:text-brand-teal transition-colors">
                    Declaración de la renta
                  </h2>
                  <p className="text-xs text-text-muted mt-1">
                    Comparte el formulario con tus familiares o empleados para
                    que rellenen los datos de las deducciones autonómicas.
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-teal mt-3">
                    Abrir
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
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm font-semibold text-brand-navy">
              Aún no hay informes disponibles
            </p>
            <p className="text-xs text-text-muted mt-2 max-w-md mx-auto">
              Cuando tu asesor habilite un formulario o un informe puntual para
              tu empresa, aparecerá aquí con su enlace para que puedas
              compartirlo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
