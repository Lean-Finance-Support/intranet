"use client";

import { useMemo, useState } from "react";
import type { ClienteService, DeptMemberSlim } from "@/app/admin/clientes/actions";

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
  companyId: string;
  onAssign: (serviceId: string, techId: string) => void;
  onRemove: (serviceId: string, techId: string) => void;
  onRemoveService: (serviceId: string) => void;
  onAssignAll: (serviceId: string) => void;
}

export default function ServiceDetailSection({
  service,
  isChiefOfDept,
  memberGroups,
  hideAssignAll,
  onAssign,
  onRemove,
  onRemoveService,
  onAssignAll,
}: Props) {
  const [editing, setEditing] = useState(false);

  const existingIds = new Set(service.technicians.map((t) => t.id));
  // Filtra los ya asignados de cada grupo y omite grupos vacíos.
  const availableGroups: MemberGroup[] = memberGroups
    .map((g) => ({
      ...g,
      members: g.members.filter((m) => !existingIds.has(m.id)),
    }))
    .filter((g) => g.members.length > 0);
  const totalAvailable = availableGroups.reduce(
    (sum, g) => sum + g.members.length,
    0
  );

  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-body">
            {service.service_name}
          </span>
          <span className="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded-full">
            {service.department_name}
          </span>
        </div>
        <div className="flex items-center gap-1">
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

      <div>
        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
          Técnicos
          <span className="font-normal normal-case tracking-normal text-text-muted/80">
            {" "}
            · {service.technicians.length}
          </span>
          {isChiefOfDept && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="ml-2 text-[11px] normal-case tracking-normal text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer"
            >
              Editar
            </button>
          )}
          {isChiefOfDept && editing && (
            <button
              onClick={() => setEditing(false)}
              className="ml-2 text-[11px] normal-case tracking-normal text-text-muted hover:text-text-body cursor-pointer"
            >
              Listo
            </button>
          )}
        </p>
        {service.technicians.length === 0 ? (
          <p className="text-xs text-text-muted italic">
            Sin técnicos asignados
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {service.technicians.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1"
              >
                <span className="text-text-body">{t.name ?? "Desconocido"}</span>
                {editing && (
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
        {editing && totalAvailable > 0 && (
          <AddTechnicianRow
            availableGroups={availableGroups}
            hideAssignAll={hideAssignAll}
            onAssign={(techId) => onAssign(service.service_id, techId)}
            onAssignAll={() => onAssignAll(service.service_id)}
          />
        )}
        {editing && totalAvailable === 0 && (
          <p className="text-[11px] text-text-muted italic mt-2">
            No quedan candidatos disponibles para asignar.
          </p>
        )}
      </div>
    </div>
  );
}

function AddTechnicianRow({
  availableGroups,
  hideAssignAll,
  onAssign,
  onAssignAll,
}: {
  availableGroups: MemberGroup[];
  hideAssignAll?: boolean;
  onAssign: (techId: string) => void;
  onAssignAll: () => void;
}) {
  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    availableGroups.length === 1 ? availableGroups[0].dept_id : ""
  );
  const hasMultipleDepts = availableGroups.length > 1;

  const filteredMembers = useMemo(() => {
    if (!selectedDeptId) return [];
    const grp = availableGroups.find((g) => g.dept_id === selectedDeptId);
    return grp?.members ?? [];
  }, [availableGroups, selectedDeptId]);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {hasMultipleDepts && (
        <select
          value={selectedDeptId}
          onChange={(e) => setSelectedDeptId(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-brand-teal"
        >
          <option value="">— Departamento —</option>
          {availableGroups.map((g) => (
            <option key={g.dept_id} value={g.dept_id}>
              {g.dept_name}
            </option>
          ))}
        </select>
      )}
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onAssign(e.target.value);
        }}
        disabled={hasMultipleDepts && !selectedDeptId}
        className="flex-1 min-w-[180px] text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-brand-teal disabled:opacity-50"
      >
        <option value="">— Persona —</option>
        {filteredMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name ?? m.id}
          </option>
        ))}
      </select>
      {!hideAssignAll && (
        <button
          onClick={onAssignAll}
          className="text-[11px] text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer whitespace-nowrap"
        >
          Asignar todos
        </button>
      )}
    </div>
  );
}
