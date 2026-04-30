"use client";

import type { ClienteService, DeptMemberSlim } from "@/app/admin/clientes/actions";

const SERVICE_ROUTES: Record<string, string> = {
  "tax-models": "/modelos",
};

interface Props {
  service: ClienteService;
  isChiefOfDept: boolean;
  members: DeptMemberSlim[];
  linkPrefix: string;
  companyId: string;
  onAssign: (serviceId: string, techId: string) => void;
  onRemove: (serviceId: string, techId: string) => void;
  onRemoveService: (serviceId: string) => void;
  onAssignAll: (serviceId: string) => void;
}

export default function ServiceDetailSection({
  service,
  isChiefOfDept,
  members,
  linkPrefix,
  companyId,
  onAssign,
  onRemove,
  onRemoveService,
  onAssignAll,
}: Props) {
  const existingIds = new Set(service.technicians.map((t) => t.id));
  const available = members.filter((m) => !existingIds.has(m.id));
  const serviceRoute = SERVICE_ROUTES[service.service_slug];

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
          {serviceRoute && (
            <a
              href={`${linkPrefix}${serviceRoute}?company=${companyId}`}
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

      {/* Technicians */}
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
        {isChiefOfDept && available.length > 0 && (
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
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.id}
                </option>
              ))}
            </select>
            <button
              onClick={() => onAssignAll(service.service_id)}
              className="text-[11px] text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer"
            >
              Asignar todos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
