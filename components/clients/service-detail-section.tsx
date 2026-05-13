"use client";

import type {
  ClienteService,
  CompanyDashboardConfig,
  DeptMemberSlim,
} from "@/app/admin/clientes/actions";
import DashboardSheetPanel from "./dashboard-sheet-panel";

export interface MemberGroup {
  dept_id: string;
  dept_name: string;
  members: DeptMemberSlim[];
}

interface Props {
  service: ClienteService;
  isChiefOfDept: boolean;
  /** Grupos de candidatos a técnico agrupados por departamento. Para servicios
   *  con dpto, normalmente 1 grupo (el del dpto). Para servicios transversales,
   *  N grupos (todos los dpts + grupo "Sin departamento" para admins sin dpto). */
  memberGroups: MemberGroup[];
  /** Si el servicio es transversal (sin dpto), ocultamos "Asignar todos" — no
   *  tiene sentido asignar a todos los admins por defecto. */
  hideAssignAll?: boolean;
  linkPrefix: string;
  companyId: string;
  onAssign: (serviceId: string, techId: string) => void;
  onRemove: (serviceId: string, techId: string) => void;
  onRemoveService: (serviceId: string) => void;
  onAssignAll: (serviceId: string) => void;
  dashboardConfig?: CompanyDashboardConfig | null;
  dashboardAuthorizedEmail?: string | null;
  canViewClientDashboard?: boolean;
  canViewClientTaxModels?: boolean;
}

export default function ServiceDetailSection({
  service,
  isChiefOfDept,
  memberGroups,
  hideAssignAll,
  linkPrefix,
  companyId,
  onAssign,
  onRemove,
  onRemoveService,
  onAssignAll,
  dashboardConfig,
  dashboardAuthorizedEmail,
  canViewClientDashboard,
  canViewClientTaxModels,
}: Props) {
  const existingIds = new Set(service.technicians.map((t) => t.id));
  // Filtra los ya asignados de cada grupo y omite grupos vacíos.
  const availableGroups: MemberGroup[] = memberGroups
    .map((g) => ({
      ...g,
      members: g.members.filter((m) => !existingIds.has(m.id)),
    }))
    .filter((g) => g.members.length > 0);
  const totalAvailable = availableGroups.reduce((sum, g) => sum + g.members.length, 0);
  const isDashboardService = service.service_slug === "dashboard";
  const showDashboardLink =
    isDashboardService &&
    !!canViewClientDashboard &&
    !!dashboardConfig;
  // Solo mostramos el icono de redirección a /modelos si el admin tiene
  // permiso de lectura sobre el dpto fiscal (mismo gate que el dashboard).
  // Si pincha sin permiso, la página /modelos rebotaría con error.
  const taxModelsHref =
    service.service_slug === "tax-models" && canViewClientTaxModels
      ? `${linkPrefix}/modelos?company=${companyId}`
      : null;

  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-body">{service.service_name}</span>
          <span className="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded-full">
            {service.department_name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {showDashboardLink && (
            <a
              href={`${linkPrefix}/clientes/${companyId}/dashboard`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-teal hover:text-brand-teal/80 px-2 py-1 rounded hover:bg-brand-teal/10 transition-colors"
              title="Ver dashboard del cliente"
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
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              Ver dashboard
            </a>
          )}
          {taxModelsHref && (
            <a
              href={taxModelsHref}
              className="p-1 rounded hover:bg-brand-teal/10 text-brand-teal transition-colors"
              title={`Ir a ${service.service_name}`}
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
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </a>
          )}
          {isChiefOfDept && (
            <button
              onClick={() => onRemoveService(service.service_id)}
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
              title="Quitar servicio"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Dashboard fiscal: panel de configuración del Sheet (sustituye al bloque de técnicos) */}
      {isDashboardService && (
        <DashboardSheetPanel
          companyId={companyId}
          initialConfig={dashboardConfig ?? null}
          authorizedEmail={dashboardAuthorizedEmail ?? null}
          canEdit={isChiefOfDept}
        />
      )}

      {/* Technicians (oculto para servicios sin técnicos como Dashboard) */}
      {!isDashboardService && (
      <div>
        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
          Técnicos
        </p>
        {service.technicians.length === 0 ? (
          <p className="text-xs text-text-muted italic">Sin técnicos asignados</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {service.technicians.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1"
              >
                <span className="text-text-body">{t.name ?? "Desconocido"}</span>
                {isChiefOfDept && (
                  <button
                    onClick={() => onRemove(service.service_id, t.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                    title="Quitar"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {isChiefOfDept && totalAvailable > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <select
              onChange={(e) => {
                if (e.target.value) {
                  onAssign(service.service_id, e.target.value);
                  e.target.value = "";
                }
              }}
              defaultValue=""
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal bg-white cursor-pointer"
            >
              <option value="" disabled>
                + Añadir técnico
              </option>
              {availableGroups.map((g) => (
                <optgroup key={g.dept_id} label={g.dept_name}>
                  {g.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.id}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {!hideAssignAll && (
              <button
                onClick={() => onAssignAll(service.service_id)}
                className="text-[11px] text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer"
              >
                Asignar todos
              </button>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
