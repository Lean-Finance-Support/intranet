"use client";

import type { ResponsibleTeam, ResponsibleTeamMember } from "@/lib/team-queries";

interface Props {
  team: ResponsibleTeam | null;
  loading?: boolean;
  /**
   * "panel" → versión compacta para el sidebar derecho.
   * "expanded" → versión amplia para el tab de detalle.
   */
  variant?: "panel" | "expanded";
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

function MemberRow({ member }: { member: ResponsibleTeamMember }) {
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
    </div>
  );
}

export default function ResponsibleTeamSection({
  team,
  loading,
  variant = "panel",
}: Props) {
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

  if (variant === "expanded") {
    return (
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Equipo responsable
        </p>
        <div className="space-y-5">
          {departments.map((dept) => (
            <div key={dept.department_id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-brand-navy">
                  {dept.department_name}
                </span>
                <span className="text-[10px] text-text-muted">
                  {dept.members.length} {dept.members.length === 1 ? "persona" : "personas"}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {dept.members.map((m) => (
                  <MemberRow key={`${dept.department_id}-${m.profile_id}`} member={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
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
