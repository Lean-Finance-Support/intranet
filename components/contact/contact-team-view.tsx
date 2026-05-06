"use client";

import type { ContactTeamData } from "@/app/app/contacto/actions";
import type { ResponsibleTeamMember } from "@/lib/team-queries";

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

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      />
    </svg>
  );
}

function HeadsetIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 9.75v3.75m0 0a3 3 0 003 3h.75v-6.75H6.75a3 3 0 00-3 3zm16.5 0v3.75m0 0a3 3 0 01-3 3H16.5v-6.75h.75a3 3 0 013 3zM3.75 9.75A8.25 8.25 0 0112 1.5a8.25 8.25 0 018.25 8.25M16.5 16.5a4.5 4.5 0 01-4.5 4.5h-1.5"
      />
    </svg>
  );
}

function MemberCard({ member }: { member: ResponsibleTeamMember }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-teal/40 hover:shadow-sm transition-all flex items-start gap-3">
      <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold bg-brand-teal/10 text-brand-teal">
        {initials(member)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-navy truncate">
          {member.full_name ?? member.email}
        </p>
        <a
          href={`mailto:${member.email}`}
          className="inline-flex items-center gap-1.5 mt-1 text-xs font-medium text-brand-teal hover:text-brand-teal/80 cursor-pointer"
        >
          <MailIcon className="w-3.5 h-3.5" />
          {member.email}
        </a>
      </div>
    </div>
  );
}

export default function ContactTeamView({ data }: { data: ContactTeamData }) {
  const departments = data.byDepartment;
  const hasTeam = departments.length > 0;

  return (
    <div className="space-y-8">
      {hasTeam ? (
        departments.map((dept) => {
          const assigned = dept.members.filter(
            (m) => m.is_technician || m.is_supervisor
          );
          const chiefs = dept.members.filter((m) => m.is_chief);

          return (
            <section key={dept.department_id}>
              <h2 className="text-base font-semibold text-brand-navy mb-3">
                {dept.department_name}
              </h2>
              {assigned.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {assigned.map((m) => (
                    <MemberCard
                      key={`${dept.department_id}-${m.profile_id}`}
                      member={m}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted italic">
                  Aún no tienes a nadie asignado en este departamento.
                </p>
              )}

              {chiefs.length > 0 && (
                <p className="mt-3 text-xs text-text-muted">
                  Si tu consulta requiere escalado, puedes contactar con el
                  responsable del departamento{" "}
                  {chiefs.map((c, i) => (
                    <span key={c.profile_id}>
                      {i > 0 && " o "}
                      <a
                        href={`mailto:${c.email}`}
                        className="text-text-body hover:text-brand-teal underline-offset-2 hover:underline"
                      >
                        {c.full_name ?? c.email}
                      </a>
                    </span>
                  ))}
                  .
                </p>
              )}
            </section>
          );
        })
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-text-muted">
            Aún no tienes un equipo asignado. Si necesitas ayuda, contacta al
            soporte técnico abajo.
          </p>
        </div>
      )}

      {/* Soporte técnico */}
      <section>
        <h2 className="text-base font-semibold text-brand-navy mb-3">
          Soporte técnico
        </h2>
        <div className="bg-gradient-to-br from-brand-navy to-brand-navy/90 rounded-xl p-5 text-white flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-brand-teal/20 flex items-center justify-center flex-shrink-0">
            <HeadsetIcon className="w-6 h-6 text-brand-teal" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Soporte técnico</p>
            <p className="text-xs text-white/70 mt-0.5">
              ¿Problemas con la plataforma o algo que no cuadra? Escríbenos y
              te ayudamos.
            </p>
          </div>
          <a
            href={`mailto:${data.support.email}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-brand-teal text-white px-3 py-2 rounded-lg hover:bg-brand-teal/90 transition-colors cursor-pointer flex-shrink-0"
          >
            <MailIcon className="w-3.5 h-3.5" />
            Escribir
          </a>
        </div>
      </section>
    </div>
  );
}
