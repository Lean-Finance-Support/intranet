import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthUser } from "@/lib/cached-queries";
import { getActiveCompanyId } from "@/lib/active-company";
import { getLinkPrefix } from "@/lib/link-prefix";
import {
  getClientRentaSummary,
  getClientRentaSubmissions,
  listClientAuthorizedFilers,
} from "./actions";
import CopyUrlButton from "./_components/copy-url-button";

/**
 * Vista cliente del servicio "Declaración de la renta".
 *
 * El cliente ve aquí:
 *   - El enlace público que su asesor ha habilitado (si lo hay).
 *   - El listado read-only de DNIs autorizados.
 *   - Una tabla de envíos recibidos con metadata únicamente (sin payload).
 *
 * Lo que NO ve (queda privado entre el familiar/empleado y el asesor):
 *   - profile_response (datos personales del declarante).
 *   - deductions_response (deducciones aplicables y campos extra).
 *   - admin_notes (notas internas del asesor).
 *   - Submissions revocadas.
 */
export default async function ClientRentaPage() {
  const { user } = await getAuthUser();
  if (!user) redirect("/app/login");

  const [prefix, activeCompanyId] = await Promise.all([
    getLinkPrefix("app"),
    getActiveCompanyId(),
  ]);
  if (!activeCompanyId) redirect(`${prefix}/select-company`);

  // Las server actions hacen el assert + filtran por empresa. Si el cliente
  // no tiene acceso (no es su empresa o no tiene el servicio contratado),
  // saltan → notFound para no filtrar la existencia del recurso.
  let summary: Awaited<ReturnType<typeof getClientRentaSummary>>;
  let submissions: Awaited<ReturnType<typeof getClientRentaSubmissions>>;
  let filers: Awaited<ReturnType<typeof listClientAuthorizedFilers>>;
  try {
    [summary, submissions, filers] = await Promise.all([
      getClientRentaSummary(activeCompanyId),
      getClientRentaSubmissions(activeCompanyId),
      listClientAuthorizedFilers(activeCompanyId),
    ]);
  } catch {
    notFound();
  }

  const expiresLabel = summary.invitationExpiresAt
    ? formatDate(summary.invitationExpiresAt)
    : null;

  return (
    <div className="px-4 sm:px-8 pt-12 pb-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <nav className="text-xs text-text-muted mb-3">
            <Link
              href={`${prefix}/informes`}
              className="hover:text-brand-teal"
            >
              Informes / Formularios
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-text-body">Declaración de la renta</span>
          </nav>
          <p className="text-brand-teal text-sm font-medium mb-2">
            Portal de clientes
          </p>
          <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
            Declaración de la renta
          </h1>
          <p className="mt-3 text-sm text-text-muted max-w-2xl">
            Tu asesor habilita un formulario público para que tus familiares o
            empleados aporten sus datos y se calculen las deducciones
            autonómicas aplicables. Aquí ves el enlace para compartirlo y el
            estado de los envíos recibidos.
          </p>
          <div className="w-10 h-0.5 bg-brand-teal rounded-full mt-6" />
        </div>

        {/* Enlace para compartir */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-brand-navy">
                Enlace para tus familiares o empleados
              </h2>
              <p className="text-xs text-text-muted mt-1 max-w-lg">
                Comparte esta URL con las personas autorizadas. Solo podrán
                acceder quienes tengan su DNI dado de alta por tu asesor.
              </p>
            </div>
            {expiresLabel && (
              <span className="text-[11px] text-text-muted">
                Caduca el {expiresLabel}
              </span>
            )}
          </div>

          {summary.invitationUrl ? (
            <div className="mt-5 flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-0 text-xs font-mono text-brand-navy bg-surface-gray rounded-lg px-3 py-2 border border-gray-100 break-all">
                {summary.invitationUrl}
              </code>
              <CopyUrlButton url={summary.invitationUrl} />
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-surface-gray border border-dashed border-gray-200 p-4 text-xs text-text-muted">
              Cuando tu asesor active el formulario, podrás compartir el enlace
              desde aquí.
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mt-6">
            <Stat label="DNIs autorizados" value={summary.filersCount} />
            <Stat label="Envíos pendientes" value={summary.pendingCount} />
            <Stat label="Envíos revisados" value={summary.reviewedCount} />
          </div>
        </section>

        {/* DNIs autorizados */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-brand-navy">
            DNIs autorizados
          </h2>
          <p className="text-xs text-text-muted mt-1 max-w-lg">
            Tu asesor mantiene el listado de personas autorizadas a usar el
            formulario. Si quieres añadir o quitar a alguien, contacta con tu
            asesor.
          </p>

          {filers.length === 0 ? (
            <div className="mt-5 rounded-xl bg-surface-gray border border-dashed border-gray-200 p-4 text-xs text-text-muted">
              Tu asesor todavía no ha dado de alta ningún DNI.
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {filers.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-navy truncate">
                      {f.full_name}
                    </p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {f.dni}
                      {f.email ? ` · ${f.email}` : ""}
                    </p>
                  </div>
                  {f.has_submission ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                      Enviado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Pendiente
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Envíos recibidos */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-brand-navy">
            Envíos recibidos
          </h2>
          <p className="text-xs text-text-muted mt-1 max-w-lg">
            Los datos que cada persona ha aportado son confidenciales entre
            ella y tu asesor. Aquí solo verás el registro de quién ha enviado
            el formulario y en qué estado está.
          </p>

          {submissions.length === 0 ? (
            <div className="mt-5 rounded-xl bg-surface-gray border border-dashed border-gray-200 p-4 text-xs text-text-muted">
              Todavía no se ha recibido ningún envío.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-text-muted border-b border-gray-100">
                    <th className="text-left font-semibold py-2 pr-3">
                      Nombre
                    </th>
                    <th className="text-left font-semibold py-2 pr-3">DNI</th>
                    <th className="text-left font-semibold py-2 pr-3">
                      Enviado
                    </th>
                    <th className="text-left font-semibold py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {submissions.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-3 text-brand-navy font-medium">
                        {s.full_name}
                      </td>
                      <td className="py-2.5 pr-3 text-text-muted">{s.dni}</td>
                      <td className="py-2.5 pr-3 text-text-muted">
                        {formatDate(s.created_at)}
                      </td>
                      <td className="py-2.5">
                        {s.status === "revisada" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                            Revisada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                            Pendiente
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-gray border border-gray-100 px-4 py-3">
      <p className="text-2xl font-semibold text-brand-navy leading-none">
        {value}
      </p>
      <p className="text-[11px] text-text-muted mt-1.5">{label}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
