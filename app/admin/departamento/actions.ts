"use server";

import { requireAdmin } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";

// getDepartmentInfo is kept for reference but not used by the page (which uses getAllDepartmentsInfo)

// ---------- Types ----------

export interface DeptMember {
  id: string;
  full_name: string | null;
  email: string;
  is_chief: boolean;
}

export interface DeptCompanyTechnician {
  technician_id: string;
  technician_name: string | null;
  service_id: string;
}

export interface DeptCompanyService {
  service_id: string;
  service_name: string;
  technicians: { technician_id: string; technician_name: string | null }[];
}

export interface DeptCompany {
  id: string;
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  services: DeptCompanyService[];
}

export interface DepartmentInfo {
  department_id: string;
  department_name: string;
  is_chief: boolean;
  members: DeptMember[];
  companies: DeptCompany[];
}

// ---------- Get department info (single department by ID) ----------

export async function getDepartmentInfo(departmentId: string): Promise<DepartmentInfo> {
  const { supabase, user, isSuperadmin } = await requireAdmin();

  if (!isSuperadmin) {
    // Verify user has access to this department
    const { data: access } = await supabase
      .from("profile_departments")
      .select("department_id")
      .eq("profile_id", user.id)
      .eq("department_id", departmentId)
      .single();
    if (!access) throw new Error("Sin acceso a este departamento");
  }

  const isChief = isSuperadmin || await (async () => {
    const { data: chiefRecord } = await supabase
      .from("department_chiefs")
      .select("department_id")
      .eq("profile_id", user.id)
      .eq("department_id", departmentId)
      .maybeSingle();
    return !!chiefRecord;
  })();

  const { data: dept } = await supabase
    .from("departments")
    .select("name")
    .eq("id", departmentId)
    .single();

  if (!dept) throw new Error("Departamento no encontrado");

  // 1. Get all department members via profile_departments (exclude superadmins — they are invisible)
  const { data: memberLinks } = await supabase
    .from("profile_departments")
    .select("profile:profiles(id, full_name, email, role)")
    .eq("department_id", departmentId);

  // Get chiefs for this department
  const { data: chiefs } = await supabase
    .from("department_chiefs")
    .select("profile_id")
    .eq("department_id", departmentId);

  const chiefIds = new Set((chiefs ?? []).map((c) => c.profile_id));

  const deptMembers: DeptMember[] = (memberLinks ?? [])
    .map((row) => {
      const p = row.profile as unknown as { id: string; full_name: string | null; email: string; role: string } | null;
      if (!p || p.role === "superadmin") return null;
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        is_chief: chiefIds.has(p.id),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));

  // 2. Get services managed by this department
  const { data: deptServices } = await supabase
    .from("department_services")
    .select("service_id, service:services(id, name, slug)")
    .eq("department_id", departmentId)
    .eq("is_active", true);

  const serviceIds = (deptServices ?? []).map((ds) => {
    const svc = ds.service as unknown as { id: string } | null;
    return svc?.id ?? "";
  }).filter(Boolean);

  const serviceMap = new Map<string, { id: string; name: string }>();
  for (const ds of deptServices ?? []) {
    const svc = ds.service as unknown as { id: string; name: string } | null;
    if (svc) serviceMap.set(svc.id, svc);
  }

  if (serviceIds.length === 0) {
    return { department_id: departmentId, department_name: dept.name, is_chief: isChief, members: deptMembers, companies: [] };
  }

  // 3. Get companies that have at least one active service in this department
  const { data: companyServices } = await supabase
    .from("company_services")
    .select("company_id, service_id")
    .in("service_id", serviceIds)
    .eq("is_active", true);

  if (!companyServices || companyServices.length === 0) {
    return { department_id: departmentId, department_name: dept.name, is_chief: isChief, members: deptMembers, companies: [] };
  }

  // Build map: company_id → service_ids
  const companyServiceMap = new Map<string, string[]>();
  for (const cs of companyServices) {
    const existing = companyServiceMap.get(cs.company_id) ?? [];
    existing.push(cs.service_id);
    companyServiceMap.set(cs.company_id, existing);
  }

  const allCompanyIds = [...companyServiceMap.keys()];

  // 4. Get all technician assignments for these companies + services
  const { data: allAssignments } = await supabase
    .from("company_technicians")
    .select("company_id, service_id, technician_id")
    .in("company_id", allCompanyIds)
    .in("service_id", serviceIds);

  // 5. If not chief, filter to only companies where this admin is assigned
  let filteredCompanyIds = allCompanyIds;
  if (!isChief) {
    const myCompanyIds = new Set(
      (allAssignments ?? [])
        .filter((a) => a.technician_id === user.id)
        .map((a) => a.company_id)
    );
    filteredCompanyIds = allCompanyIds.filter((id) => myCompanyIds.has(id));
  }

  if (filteredCompanyIds.length === 0) {
    return { department_id: departmentId, department_name: dept.name, is_chief: isChief, members: deptMembers, companies: [] };
  }

  // 6. Get company details (superadmin sees demo companies too)
  let companiesQuery = supabase
    .from("companies")
    .select("id, legal_name, company_name, nif")
    .in("id", filteredCompanyIds)
    .order("legal_name");
  if (!isSuperadmin) companiesQuery = companiesQuery.eq("is_demo", false);
  const { data: companies } = await companiesQuery;

  // Build member name map
  const memberNameMap = new Map<string, string | null>();
  for (const m of deptMembers) {
    memberNameMap.set(m.id, m.full_name);
  }

  // Build assignments by company+service
  const assignmentMap = new Map<string, Map<string, { technician_id: string; technician_name: string | null }[]>>();
  for (const a of allAssignments ?? []) {
    if (!assignmentMap.has(a.company_id)) assignmentMap.set(a.company_id, new Map());
    const svcMap = assignmentMap.get(a.company_id)!;
    if (!svcMap.has(a.service_id)) svcMap.set(a.service_id, []);
    svcMap.get(a.service_id)!.push({
      technician_id: a.technician_id,
      technician_name: memberNameMap.get(a.technician_id) ?? null,
    });
  }

  const deptCompanies: DeptCompany[] = (companies ?? []).map((c) => {
    const svcIds = companyServiceMap.get(c.id) ?? [];
    const services: DeptCompanyService[] = svcIds
      .map((svcId) => {
        const svc = serviceMap.get(svcId);
        if (!svc) return null;
        const techs = assignmentMap.get(c.id)?.get(svcId) ?? [];
        return {
          service_id: svc.id,
          service_name: svc.name,
          technicians: techs,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    return {
      id: c.id,
      legal_name: c.legal_name,
      company_name: c.company_name,
      nif: c.nif,
      services,
    };
  });

  return {
    department_id: departmentId,
    department_name: dept.name,
    is_chief: isChief,
    members: deptMembers,
    companies: deptCompanies,
  };
}

// ---------- Get ALL departments info for current user ----------

export async function getAllDepartmentsInfo(): Promise<DepartmentInfo[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) throw new Error("Sin permisos");

  const isSuperadmin = profile.role === "superadmin";

  // Get departments: superadmin sees all, others only their own
  let deptIds: string[];
  if (isSuperadmin) {
    const { data: allDepts } = await supabase.from("departments").select("id");
    deptIds = (allDepts ?? []).map((d) => d.id as string);
  } else {
    const { data: userDepts } = await supabase
      .from("profile_departments")
      .select("department_id")
      .eq("profile_id", user.id);
    deptIds = (userDepts ?? []).map((d) => d.department_id as string);
  }

  if (deptIds.length === 0) return [];

  // Batch queries
  const [{ data: depts }, { data: allMemberLinks }, { data: allChiefs }, { data: allDeptServices }] =
    await Promise.all([
      supabase.from("departments").select("id, name").in("id", deptIds),
      supabase.from("profile_departments").select("department_id, profile:profiles(id, full_name, email, role)").in("department_id", deptIds),
      supabase.from("department_chiefs").select("department_id, profile_id").in("department_id", deptIds),
      supabase.from("department_services").select("department_id, service_id, service:services(id, name)").in("department_id", deptIds).eq("is_active", true),
    ]);

  const allServiceIds = [...new Set((allDeptServices ?? []).map((ds) => {
    const svc = ds.service as unknown as { id: string } | null;
    return svc?.id ?? "";
  }).filter(Boolean))];

  let companyServices: { company_id: string; service_id: string }[] = [];
  let allAssignments: { company_id: string; service_id: string; technician_id: string }[] = [];
  let companies: { id: string; legal_name: string; company_name: string | null; nif: string | null }[] = [];

  if (allServiceIds.length > 0) {
    const [csRes, assignRes] = await Promise.all([
      supabase.from("company_services").select("company_id, service_id").in("service_id", allServiceIds).eq("is_active", true),
      supabase.from("company_technicians").select("company_id, service_id, technician_id").in("service_id", allServiceIds),
    ]);
    companyServices = csRes.data ?? [];
    allAssignments = assignRes.data ?? [];

    const allCompanyIds = [...new Set(companyServices.map((cs) => cs.company_id))];
    if (allCompanyIds.length > 0) {
      let compQuery = supabase.from("companies").select("id, legal_name, company_name, nif").in("id", allCompanyIds).order("legal_name");
      if (!isSuperadmin) compQuery = compQuery.eq("is_demo", false);
      const { data: compData } = await compQuery;
      companies = compData ?? [];
    }
  }

  const companyMap = new Map(companies.map((c) => [c.id, c]));

  function buildMembers(deptId: string): DeptMember[] {
    const chiefIds = new Set((allChiefs ?? []).filter((c) => c.department_id === deptId).map((c) => c.profile_id));
    return (allMemberLinks ?? [])
      .filter((row) => row.department_id === deptId)
      .map((row) => {
        const p = row.profile as unknown as { id: string; full_name: string | null; email: string; role: string } | null;
        if (!p || p.role === "superadmin") return null;
        return { id: p.id, full_name: p.full_name, email: p.email, is_chief: chiefIds.has(p.id) };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
  }

  return (depts ?? []).map((dept) => {
    const isChief = isSuperadmin || (allChiefs ?? []).some((c) => c.profile_id === user.id && c.department_id === dept.id);
    const members = buildMembers(dept.id);
    const memberNameMap = new Map(members.map((m) => [m.id, m.full_name]));

    const deptServiceEntries = (allDeptServices ?? []).filter((ds) => ds.department_id === dept.id);
    const deptServiceMap = new Map<string, { id: string; name: string }>();
    for (const ds of deptServiceEntries) {
      const svc = ds.service as unknown as { id: string; name: string } | null;
      if (svc) deptServiceMap.set(svc.id, svc);
    }
    const deptServiceIds = [...deptServiceMap.keys()];

    if (deptServiceIds.length === 0) {
      return { department_id: dept.id, department_name: dept.name, is_chief: isChief, members, companies: [] };
    }

    const deptCompanyServiceMap = new Map<string, string[]>();
    for (const cs of companyServices) {
      if (!deptServiceIds.includes(cs.service_id)) continue;
      const existing = deptCompanyServiceMap.get(cs.company_id) ?? [];
      existing.push(cs.service_id);
      deptCompanyServiceMap.set(cs.company_id, existing);
    }

    let filteredCompanyIds = [...deptCompanyServiceMap.keys()];
    if (!isChief) {
      const myCompanyIds = new Set(
        allAssignments.filter((a) => a.technician_id === user.id && deptServiceIds.includes(a.service_id)).map((a) => a.company_id)
      );
      filteredCompanyIds = filteredCompanyIds.filter((id) => myCompanyIds.has(id));
    }

    const assignmentMap = new Map<string, Map<string, { technician_id: string; technician_name: string | null }[]>>();
    for (const a of allAssignments) {
      if (!deptServiceIds.includes(a.service_id)) continue;
      if (!assignmentMap.has(a.company_id)) assignmentMap.set(a.company_id, new Map());
      const svcMap = assignmentMap.get(a.company_id)!;
      if (!svcMap.has(a.service_id)) svcMap.set(a.service_id, []);
      svcMap.get(a.service_id)!.push({ technician_id: a.technician_id, technician_name: memberNameMap.get(a.technician_id) ?? null });
    }

    const deptCompanies: DeptCompany[] = filteredCompanyIds
      .map((companyId) => {
        const c = companyMap.get(companyId);
        if (!c) return null;
        const svcIds = deptCompanyServiceMap.get(companyId) ?? [];
        const services: DeptCompanyService[] = svcIds
          .map((svcId) => {
            const svc = deptServiceMap.get(svcId);
            if (!svc) return null;
            return { service_id: svc.id, service_name: svc.name, technicians: assignmentMap.get(companyId)?.get(svcId) ?? [] };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);
        return { id: c.id, legal_name: c.legal_name, company_name: c.company_name, nif: c.nif, services };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.legal_name.localeCompare(b.legal_name));

    return { department_id: dept.id, department_name: dept.name, is_chief: isChief, members, companies: deptCompanies };
  });
}

// ---------- Update company commercial name ----------

export async function updateCompanyName(
  companyId: string,
  companyName: string | null
): Promise<void> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("companies")
    .update({ company_name: companyName || null, updated_at: new Date().toISOString() })
    .eq("id", companyId);

  if (error) {
    console.error("[admin/departamento] updateCompanyName error:", error.code);
    throw new Error("Error al actualizar el nombre comercial.");
  }
}

// ---------- Assign technician to company service ----------

export async function assignTechnician(
  companyId: string,
  serviceId: string,
  technicianId: string
): Promise<void> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("company_technicians")
    .insert({ company_id: companyId, service_id: serviceId, technician_id: technicianId });

  if (error) {
    if (error.code === "23505") return; // already assigned
    console.error("[admin/departamento] assignTechnician error:", error.code);
    throw new Error("Error al asignar el técnico.");
  }
}

// ---------- Remove technician from company service ----------

export async function removeTechnician(
  companyId: string,
  serviceId: string,
  technicianId: string
): Promise<void> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("company_technicians")
    .delete()
    .eq("company_id", companyId)
    .eq("service_id", serviceId)
    .eq("technician_id", technicianId);

  if (error) {
    console.error("[admin/departamento] removeTechnician error:", error.code);
    throw new Error("Error al eliminar el técnico.");
  }
}

// ---------- Assign ALL department members to a company service ----------

export async function assignAllMembers(companyId: string, serviceId: string, departmentId: string): Promise<void> {
  const { supabase } = await requireAdmin();

  const { data: memberLinks } = await supabase
    .from("profile_departments")
    .select("profile_id")
    .eq("department_id", departmentId);

  for (const link of memberLinks ?? []) {
    const { error } = await supabase
      .from("company_technicians")
      .insert({ company_id: companyId, service_id: serviceId, technician_id: link.profile_id });

    if (error && error.code !== "23505") {
      console.error("[admin/departamento] assignAllMembers error:", error.code);
      throw new Error("Error al asignar miembros.");
    }
  }
}
