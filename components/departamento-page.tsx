"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  DepartmentInfo,
  DeptMember,
} from "@/app/admin/departamento/actions";
import type { CurrentUserDelegation } from "@/app/admin/departamento/permissions-actions";
import MemberCard from "@/components/team/member-card";
import MemberPermissionsDrawer from "@/components/team/member-permissions-drawer";
import AddDeptMemberModal from "@/components/team/add-dept-member-modal";

interface Props {
  departments: DepartmentInfo[];
  currentUserDeptIds: string[];
  manageMembershipDeptIds: string[];
  delegations: CurrentUserDelegation[];
  backofficeMaxLevel: 0 | 1 | 2;
}

export default function DepartamentoPage({
  departments,
  currentUserDeptIds,
  manageMembershipDeptIds,
  delegations,
  backofficeMaxLevel,
}: Props) {
  const router = useRouter();
  const deptIdSet = useMemo(() => new Set(currentUserDeptIds), [currentUserDeptIds]);
  const manageMembershipSet = useMemo(
    () => new Set(manageMembershipDeptIds),
    [manageMembershipDeptIds]
  );

  const deptLookup = useMemo(
    () => departments.map((d) => ({ id: d.department_id, name: d.department_name })),
    [departments]
  );

  // Tab por defecto: el primer depto propio, si lo hay; si no, el primero.
  const defaultIndex = useMemo(() => {
    const idx = departments.findIndex((d) => deptIdSet.has(d.department_id));
    return idx >= 0 ? idx : 0;
  }, [departments, deptIdSet]);

  const [activeIdx, setActiveIdx] = useState(defaultIndex);
  const [managing, setManaging] = useState<DeptMember | null>(null);
  const [addingToDeptId, setAddingToDeptId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (departments.length === 0) {
    return (
      <div className="min-h-full px-8 py-12">
        <div className="max-w-6xl">
          <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
          <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight mb-6">
            Mi equipo
          </h1>
          <div className="text-sm text-text-muted bg-surface-gray rounded-xl p-4">
            Aún no hay departamentos configurados.
          </div>
        </div>
      </div>
    );
  }

  const active = departments[activeIdx] ?? departments[0];
  const canManageActiveDept = manageMembershipSet.has(active.department_id);

  return (
    <div className="min-h-full px-8 py-12">
      <div className="max-w-6xl space-y-8">
        <div>
          <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
          <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
            Mi equipo
          </h1>
          <p className="text-sm text-text-muted mt-2">
            Todos los departamentos y sus miembros. Pulsa sobre un miembro para
            ver sus permisos.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {departments.map((dept, idx) => {
            const isActive = idx === activeIdx;
            return (
              <button
                key={dept.department_id}
                onClick={() => setActiveIdx(idx)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-brand-navy text-white"
                    : "bg-white border border-gray-200 text-text-body hover:border-brand-navy/30 hover:text-brand-navy"
                }`}
              >
                {dept.department_name}
              </button>
            );
          })}
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-brand-navy leading-none">
                {active.department_name}
              </h2>
              {active.current_user_role === "chief" && (
                <span className="text-[11px] bg-brand-teal text-white px-2 py-0.5 rounded-full font-semibold">
                  Chief
                </span>
              )}
              {active.current_user_role === "miembro" && (
                <span className="text-[11px] bg-brand-navy/10 text-brand-navy px-2 py-0.5 rounded-full font-medium">
                  Miembro
                </span>
              )}
              {active.current_user_role === "operador" && (
                <span className="text-[11px] bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full font-medium">
                  Operador
                </span>
              )}
              {active.current_user_role === "observador" && (
                <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                  Observador
                </span>
              )}
            </div>
            {canManageActiveDept && (
              <button
                type="button"
                onClick={() => setAddingToDeptId(active.department_id)}
                className="inline-flex items-center gap-1.5 bg-brand-teal text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-teal/90 transition-colors cursor-pointer flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Añadir empleado
              </button>
            )}
          </div>

          {(() => {
            const actualMembers = active.members.filter(
              (m) => m.dept_role !== "observador" && m.dept_role !== "operador"
            );
            const operators = active.members.filter((m) => m.dept_role === "operador");
            const observers = active.members.filter((m) => m.dept_role === "observador");
            return (
              <>
                <div className="space-y-3">
                  <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                    Miembros
                  </h3>
                  {actualMembers.length === 0 ? (
                    <p className="text-sm text-text-muted italic">
                      Aún no hay miembros asignados a este departamento.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {actualMembers.map((m) => (
                        <MemberCard
                          key={m.id}
                          member={m}
                          onOpen={(member) => setManaging(member)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {operators.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                      Operadores
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {operators.map((m) => (
                        <MemberCard
                          key={m.id}
                          member={m}
                          onOpen={(member) => setManaging(member)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {observers.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                      Observadores
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {observers.map((m) => (
                        <MemberCard
                          key={m.id}
                          member={m}
                          onOpen={(member) => setManaging(member)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

        </section>
      </div>

      {managing && (
        <MemberPermissionsDrawer
          member={managing}
          delegations={delegations}
          departments={deptLookup}
          manageMembershipDeptIds={manageMembershipDeptIds}
          backofficeMaxLevel={backofficeMaxLevel}
          onClose={() => setManaging(null)}
          onMutated={() => startTransition(() => router.refresh())}
        />
      )}

      {addingToDeptId && (
        <AddDeptMemberModal
          deptId={addingToDeptId}
          deptName={
            departments.find((d) => d.department_id === addingToDeptId)?.department_name ??
            "departamento"
          }
          onClose={() => setAddingToDeptId(null)}
          onAdded={() => {
            setAddingToDeptId(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}
