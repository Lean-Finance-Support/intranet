"use server";

import { requireClient } from "@/lib/require-client";
import { createAdminClient } from "@/lib/supabase/server";
import {
  fetchChiefsForDepartment,
  getCachedCompanyResponsibleTeam,
  type ResponsibleTeamMember,
} from "@/lib/team-queries";

export interface ContactDepartment {
  department_id: string;
  department_name: string;
  members: ResponsibleTeamMember[];
}

export interface ContactTeamData {
  byDepartment: ContactDepartment[];
  support: { full_name: string; email: string };
}

export async function getMyContactTeam(): Promise<ContactTeamData> {
  const { companyId } = await requireClient();
  const admin = createAdminClient();

  const team = await getCachedCompanyResponsibleTeam(companyId);

  // Para cada departamento implicado (i.e. con técnico o supervisor asignado),
  // asegurar que el chief del departamento aparece — aunque no esté asignado
  // directamente al cliente. Es el referente último del departamento.
  for (const dept of team.byDepartment) {
    const chiefs = await fetchChiefsForDepartment(admin, dept.department_id);
    for (const chief of chiefs) {
      const existing = dept.members.find((m) => m.profile_id === chief.profile_id);
      if (existing) {
        existing.is_chief = true;
      } else {
        dept.members.unshift({
          profile_id: chief.profile_id,
          full_name: chief.full_name,
          email: chief.email,
          is_chief: true,
          is_technician: false,
          is_supervisor: false,
          technician_services: [],
        });
      }
    }
  }

  return {
    byDepartment: team.byDepartment,
    support: { full_name: "Soporte técnico", email: "mpantoja@leanfinance.es" },
  };
}
