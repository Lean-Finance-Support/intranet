"use client";

import type { DeptMember } from "@/app/admin/departamento/actions";

interface MemberCardProps {
  member: DeptMember;
  onOpen: (member: DeptMember) => void;
}

function initials(name: string | null, email: string): string {
  const source = name ?? email;
  const parts = source.split(/[\s.@]/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

export default function MemberCard({ member, onOpen }: MemberCardProps) {
  const deptRole = member.dept_role;

  return (
    <button
      type="button"
      onClick={() => onOpen(member)}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 text-left hover:border-brand-teal/40 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0 text-brand-teal font-semibold text-sm">
          {initials(member.full_name, member.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-brand-navy truncate">
            {member.full_name ?? member.email}
          </div>
          <div className="text-xs text-text-muted truncate">{member.email}</div>
        </div>
        {deptRole === "chief" && (
          <span className="text-[10px] bg-brand-teal text-white px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
            Chief
          </span>
        )}
        {deptRole === "operador" && (
          <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full font-medium flex-shrink-0">
            Operador
          </span>
        )}
        {deptRole === "observador" && (
          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
            Observador
          </span>
        )}
      </div>

    </button>
  );
}
