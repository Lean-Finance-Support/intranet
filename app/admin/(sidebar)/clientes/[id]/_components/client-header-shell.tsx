import Link from "next/link";

/**
 * Cabecera "shell" del detalle de cliente. La pinta la page server con SOLO
 * `getCompanyDetail(id)` (lookup por PK, ~30 ms) + `linkPrefix`, así que aparece
 * casi instantáneamente — antes de que carguen documentación, equipo y
 * dashboard config.
 *
 * Pintar el h1 con el nombre del cliente aquí adelanta el LCP de Vercel: el
 * navegador ya tiene un elemento grande visible mientras el workspace
 * (tabs + content) llega vía streaming Suspense.
 *
 * Mantiene la misma estética que el header sticky del workspace para que al
 * llegar éste no haya un salto visual perceptible.
 */
interface ShellDetail {
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  deleted_at: string | null;
}

export default function ClientHeaderShell({
  detail,
  linkPrefix,
}: {
  detail: ShellDetail;
  linkPrefix: string;
}) {
  return (
    <div className="pt-4 pb-0">
      <nav className="text-xs text-text-muted mb-3 flex items-center gap-1.5">
        <Link href={`${linkPrefix}/clientes`} className="hover:text-text-body cursor-pointer">
          Clientes
        </Link>
        <span>/</span>
        <span className="text-text-body font-medium truncate">{detail.legal_name}</span>
      </nav>

      <div>
        <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
          {detail.legal_name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-muted">
          {detail.company_name && (
            <span className="text-text-body">{detail.company_name}</span>
          )}
          {detail.nif && <span className="font-mono">{detail.nif}</span>}
          {detail.deleted_at && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-gray-200 text-text-muted px-2 py-0.5 rounded-full font-medium">
              Empresa eliminada
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
