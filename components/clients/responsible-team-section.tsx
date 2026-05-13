"use client";

import { useState } from "react";
import type { ResponsibleTeam, ResponsibleTeamMember } from "@/lib/team-queries";
import type { TeamMemberCandidate } from "@/app/admin/clientes/actions";
import ConfirmDialog from "@/components/confirm-dialog";

export interface TeamManageProps {
  canManage: boolean;
  candidates: TeamMemberCandidate[];
  /** Dpts donde el actor tiene write_dept_service. Solo los miembros cuyos
   *  dpts intersectan con este set ofrecen la X de "quitar". */
  manageableDeptIds: string[];
  onAdd: (profileId: string) => Promise<void>;
  onRemove: (profileId: string) => Promise<void>;
}

interface Props {
  team: ResponsibleTeam | null;
  loading?: boolean;
  /**
   * "panel" → versión compacta para el sidebar derecho.
   * "expanded" → versión amplia para el tab de detalle.
   */
  variant?: "panel" | "expanded";
  /** Solo se renderizan controles de añadir/quitar si se pasa esta prop. */
  manage?: TeamManageProps;
}

function initials(member: { full_name: string | null; email: string }): string {
  const name = member.full_name?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return (member.email[0] ?? "?").toUpperCase();
}

function MemberChip({ member }: { member: ResponsibleTeamMember }) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 min-w-0">
      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-semibold bg-brand-teal/10 text-brand-teal">
        {initials(member)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-body truncate leading-tight">
          {member.full_name ?? member.email}
        </p>
        <p className="text-[10px] text-text-muted truncate leading-tight">
          {member.email}
        </p>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  onRemove,
  busy,
}: {
  member: ResponsibleTeamMember;
  onRemove?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 min-w-0">
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold bg-brand-teal/10 text-brand-teal">
        {initials(member)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-body truncate">
          {member.full_name ?? member.email}
        </p>
        <p className="text-xs text-text-muted truncate">{member.email}</p>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={busy}
          title="Quitar del equipo"
          className="text-text-muted hover:text-red-500 hover:bg-red-50 cursor-pointer w-7 h-7 inline-flex items-center justify-center rounded-md disabled:opacity-50 flex-shrink-0"
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
  );
}

export default function ResponsibleTeamSection({
  team,
  loading,
  variant = "panel",
  manage,
}: Props) {
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{
    profileId: string;
    name: string;
  } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerFilter, setPickerFilter] = useState<string | null>(null);

  async function performAdd(profileId: string) {
    if (!manage) return;
    setBusyProfileId(profileId);
    setError(null);
    try {
      await manage.onAdd(profileId);
      setShowPicker(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusyProfileId(null);
    }
  }

  async function performRemove(profileId: string) {
    if (!manage) return;
    setBusyProfileId(profileId);
    setError(null);
    try {
      await manage.onRemove(profileId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusyProfileId(null);
      setPendingRemove(null);
    }
  }

  if (loading) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Equipo responsable
        </h3>
        <div className="space-y-2 animate-pulse">
          <div className="h-12 bg-gray-100 rounded-lg" />
          <div className="h-12 bg-gray-100 rounded-lg" />
        </div>
      </section>
    );
  }

  const departments = team?.byDepartment ?? [];
  const canManage = manage?.canManage === true;
  const manageableDeptSet = new Set(manage?.manageableDeptIds ?? []);
  const candidatesAll = manage?.candidates ?? [];
  const visibleCandidates = pickerFilter
    ? candidatesAll.filter((c) => c.department_ids.includes(pickerFilter))
    : candidatesAll;

  if (variant === "expanded") {
    return (
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Equipo responsable
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              disabled={candidatesAll.length === 0}
              title={
                candidatesAll.length === 0
                  ? "No hay empleados disponibles para añadir"
                  : "Añadir empleado al equipo"
              }
              className="text-xs text-brand-teal hover:text-white hover:bg-brand-teal px-3 py-1.5 rounded-lg border border-brand-teal/40 hover:border-brand-teal cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              + Añadir empleado
            </button>
          )}
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {departments.length === 0 ? (
          <p className="text-sm text-text-muted italic">Sin equipo asignado todavía</p>
        ) : (
          <div className="space-y-5">
            {departments.map((dept) => (
              <div key={dept.department_id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-navy">
                    {dept.department_name}
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {dept.members.length}{" "}
                    {dept.members.length === 1 ? "persona" : "personas"}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {dept.members.map((m) => {
                    const canRemoveThis =
                      canManage && manageableDeptSet.has(dept.department_id);
                    return (
                      <MemberRow
                        key={`${dept.department_id}-${m.profile_id}`}
                        member={m}
                        onRemove={
                          canRemoveThis
                            ? () =>
                                setPendingRemove({
                                  profileId: m.profile_id,
                                  name: m.full_name ?? m.email,
                                })
                            : undefined
                        }
                        busy={busyProfileId === m.profile_id}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {showPicker && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-full max-w-md pointer-events-auto max-h-[80vh] overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-brand-navy">
                  Añadir empleado al equipo
                </h3>
                <button
                  onClick={() => {
                    setShowPicker(false);
                    setPickerFilter(null);
                  }}
                  className="text-text-muted hover:text-text-body cursor-pointer w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-gray-100"
                >
                  <svg
                    className="w-4 h-4"
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
              </div>

              {/* Filtros por dpto */}
              <div className="px-5 pt-3 pb-1 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setPickerFilter(null)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
                    pickerFilter === null
                      ? "bg-brand-navy text-white border-brand-navy"
                      : "bg-white text-text-muted border-gray-200 hover:border-gray-300"
                  }`}
                >
                  Todos
                </button>
                {departmentsFromCandidates(candidatesAll).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setPickerFilter(d.id)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
                      pickerFilter === d.id
                        ? "bg-brand-navy text-white border-brand-navy"
                        : "bg-white text-text-muted border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-3">
                {visibleCandidates.length === 0 ? (
                  <p className="text-xs text-text-muted italic text-center py-6">
                    No hay empleados disponibles para añadir.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {visibleCandidates.map((c) => (
                      <li key={c.profile_id}>
                        <button
                          onClick={() => performAdd(c.profile_id)}
                          disabled={busyProfileId === c.profile_id}
                          className="w-full text-left rounded-lg px-3 py-2 hover:bg-brand-teal/5 cursor-pointer flex items-center gap-3 border border-gray-100 disabled:opacity-50"
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-semibold bg-brand-teal/10 text-brand-teal">
                            {initials(c)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-body truncate">
                              {c.full_name ?? c.email}
                            </p>
                            <p className="text-[11px] text-text-muted truncate">
                              {c.department_names.join(" · ") || "Sin departamento"}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {pendingRemove && (
          <ConfirmDialog
            title="Quitar del equipo"
            message={`¿Quitar a ${pendingRemove.name} del equipo? Se desvinculará como técnico de los servicios y como supervisor de los apartados de este cliente.`}
            confirmLabel="Quitar"
            destructive
            onConfirm={async () => {
              await performRemove(pendingRemove.profileId);
            }}
            onCancel={() => setPendingRemove(null)}
          />
        )}
      </section>
    );
  }

  if (departments.length === 0) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Equipo responsable
        </h3>
        <p className="text-sm text-text-muted italic">Sin equipo asignado todavía</p>
      </section>
    );
  }

  // Panel (compact)
  return (
    <section>
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Equipo responsable
      </h3>
      <div className="space-y-3">
        {departments.map((dept) => (
          <div key={dept.department_id} className="space-y-1.5">
            <p className="text-[11px] font-semibold text-brand-navy">
              {dept.department_name}
            </p>
            <div className="space-y-1.5">
              {dept.members.map((m) => (
                <MemberChip key={`${dept.department_id}-${m.profile_id}`} member={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function departmentsFromCandidates(
  candidates: TeamMemberCandidate[]
): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const c of candidates) {
    c.department_ids.forEach((id, idx) => {
      if (!seen.has(id)) seen.set(id, c.department_names[idx] ?? "");
    });
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .filter((d) => d.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
