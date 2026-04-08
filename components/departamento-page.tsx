"use client";

import { useState } from "react";
import type { DepartmentInfo, DeptMember } from "@/app/admin/departamento/actions";

// ---------- Members Panel ----------
function MembersPanel({ members }: { members: DeptMember[] }) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-2 bg-white rounded-full px-3 py-2 border border-gray-100 shadow-sm">
          <div className="w-6 h-6 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <span className="text-sm text-text-body">{m.full_name ?? m.email}</span>
          {m.is_chief && <span className="text-[10px] bg-brand-navy/10 text-brand-navy px-1.5 py-0.5 rounded-full font-medium">Responsable</span>}
        </div>
      ))}
    </div>
  );
}

// ---------- Department Section ----------
function DepartmentSection({ dept }: { dept: DepartmentInfo }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-brand-navy">{dept.department_name}</h2>
        {dept.is_chief && (
          <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full font-medium">Responsable</span>
        )}
      </div>
      <MembersPanel members={dept.members} />
    </div>
  );
}

// ---------- Main Component ----------
export default function DepartamentoPage({ departments }: { departments: DepartmentInfo[] }) {
  const [activeDeptIndex, setActiveDeptIndex] = useState(0);
  const activeDept = departments[activeDeptIndex] ?? departments[0];

  if (departments.length === 0) {
    return (
      <div className="min-h-full px-8 py-12">
        <div className="max-w-6xl">
          <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
          <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight mb-6">Mi departamento</h1>
          <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4">Sin departamento asignado</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-8 py-12">
      <div className="max-w-6xl space-y-8">
        <div>
          <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
          <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">Mi departamento</h1>
        </div>

        {departments.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {departments.map((dept, idx) => (
              <button
                key={dept.department_id}
                onClick={() => setActiveDeptIndex(idx)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  activeDeptIndex === idx
                    ? "bg-brand-navy text-white"
                    : "bg-white border border-gray-200 text-text-body hover:border-brand-navy/30 hover:text-brand-navy"
                }`}
              >
                {dept.department_name}
                {dept.is_chief && (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${activeDeptIndex === idx ? "bg-white/20 text-white" : "bg-brand-teal/10 text-brand-teal"}`}>
                    Responsable
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <DepartmentSection key={activeDept.department_id} dept={activeDept} />
      </div>
    </div>
  );
}
