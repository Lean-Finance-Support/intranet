"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, department_id")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    throw new Error("Sin permisos");
  }

  const isSuperadmin = profile.role === "superadmin";

  // Superadmin uses cookie-based department, regular admin uses profile department
  let departmentId = profile.department_id;
  if (isSuperadmin) {
    const cookieStore = await cookies();
    departmentId = cookieStore.get("sa-department-id")?.value ?? null;
  }

  if (!departmentId) {
    throw new Error("Sin departamento asignado");
  }

  const { data: dept } = await supabase
    .from("departments")
    .select("id, name, slug, chief_id")
    .eq("id", departmentId)
    .single();

  if (!dept) throw new Error("Departamento no encontrado");

  // Superadmin is always chief of any department they enter
  const isChief = isSuperadmin || dept.chief_id === user.id;

  return { supabase, user, departmentId, dept, isChief, isSuperadmin };
}

// ---------- Types ----------

export interface DeptMember {
  id: string;
  full_name: string | null;
  email: string;
  is_chief: boolean;
}

export interface DeptCompanyTechnician {
  id: string; // company_technicians.id (for deletion)
  technician_id: string;
  technician_name: string | null;
}

export interface DeptCompany {
  id: string;
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  services: string[]; // active service names contracted by this company in the dept
  technicians: DeptCompanyTechnician[];
}

export interface DepartmentInfo {
  department_name: string;
  is_chief: boolean;
  members: DeptMember[];
  companies: DeptCompany[];
}

// ---------- Get department info ----------

export async function getDepartmentInfo(): Promise<DepartmentInfo> {
  const { supabase, user, departmentId, dept, isChief, isSuperadmin } = await requireAdmin();

  // 1. Get all department members
  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("department_id", departmentId)
    .eq("role", "admin")
    .order("full_name");

  const deptMembers: DeptMember[] = (members ?? []).map((m) => ({
    id: m.id,
    full_name: m.full_name,
    email: m.email,
    is_chief: m.id === dept.chief_id,
  }));

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

  const serviceNameMap = new Map<string, string>();
  for (const ds of deptServices ?? []) {
    const svc = ds.service as unknown as { id: string; name: string } | null;
    if (svc) serviceNameMap.set(svc.id, svc.name);
  }

  if (serviceIds.length === 0) {
    return { department_name: dept.name, is_chief: isChief, members: deptMembers, companies: [] };
  }

  // 3. Get companies that have at least one active service in this department
  const { data: companyServices } = await supabase
    .from("company_services")
    .select("company_id, service_id")
    .in("service_id", serviceIds)
    .eq("is_active", true);

  if (!companyServices || companyServices.length === 0) {
    return { department_name: dept.name, is_chief: isChief, members: deptMembers, companies: [] };
  }

  // Build map: company_id → service names
  const companyServiceMap = new Map<string, string[]>();
  for (const cs of companyServices) {
    const existing = companyServiceMap.get(cs.company_id) ?? [];
    const svcName = serviceNameMap.get(cs.service_id);
    if (svcName) existing.push(svcName);
    companyServiceMap.set(cs.company_id, existing);
  }

  const companyIds = [...companyServiceMap.keys()];

  // 4. If not chief, filter to only companies assigned to this admin
  let filteredCompanyIds = companyIds;
  if (!isChief) {
    const { data: myAssignments } = await supabase
      .from("company_technicians")
      .select("company_id")
      .eq("technician_id", user.id);

    const myCompanyIds = new Set((myAssignments ?? []).map((a) => a.company_id));
    filteredCompanyIds = companyIds.filter((id) => myCompanyIds.has(id));
  }

  if (filteredCompanyIds.length === 0) {
    return { department_name: dept.name, is_chief: isChief, members: deptMembers, companies: [] };
  }

  // 5. Get company details (hide demo companies from non-superadmin)
  let companiesQuery = supabase
    .from("companies")
    .select("id, legal_name, company_name, nif")
    .in("id", filteredCompanyIds);
  if (!isSuperadmin) companiesQuery = companiesQuery.eq("is_demo", false);
  const { data: companies } = await companiesQuery.order("legal_name");

  // 6. Get technician assignments for these companies
  const { data: allAssignments } = await supabase
    .from("company_technicians")
    .select("id, company_id, technician_id")
    .in("company_id", filteredCompanyIds);

  // Build map: technician_id → name (from members we already have)
  const memberNameMap = new Map<string, string | null>();
  for (const m of members ?? []) {
    memberNameMap.set(m.id, m.full_name);
  }

  const assignmentsByCompany = new Map<string, DeptCompanyTechnician[]>();
  for (const a of allAssignments ?? []) {
    const existing = assignmentsByCompany.get(a.company_id) ?? [];
    existing.push({
      id: a.id,
      technician_id: a.technician_id,
      technician_name: memberNameMap.get(a.technician_id) ?? null,
    });
    assignmentsByCompany.set(a.company_id, existing);
  }

  const deptCompanies: DeptCompany[] = (companies ?? []).map((c) => ({
    id: c.id,
    legal_name: c.legal_name,
    company_name: c.company_name,
    nif: c.nif,
    services: companyServiceMap.get(c.id) ?? [],
    technicians: assignmentsByCompany.get(c.id) ?? [],
  }));

  return {
    department_name: dept.name,
    is_chief: isChief,
    members: deptMembers,
    companies: deptCompanies,
  };
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

// ---------- Assign technician to company ----------

export async function assignTechnician(
  companyId: string,
  technicianId: string
): Promise<void> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("company_technicians")
    .insert({ company_id: companyId, technician_id: technicianId });

  if (error) {
    if (error.code === "23505") return; // already assigned, ignore
    console.error("[admin/departamento] assignTechnician error:", error.code);
    throw new Error("Error al asignar el técnico.");
  }
}

// ---------- Remove technician from company ----------

export async function removeTechnician(
  companyId: string,
  technicianId: string
): Promise<void> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("company_technicians")
    .delete()
    .eq("company_id", companyId)
    .eq("technician_id", technicianId);

  if (error) {
    console.error("[admin/departamento] removeTechnician error:", error.code);
    throw new Error("Error al eliminar el técnico.");
  }
}

// ---------- Assign ALL department members to a company ----------

export async function assignAllMembers(companyId: string): Promise<void> {
  const { supabase, departmentId } = await requireAdmin();

  const { data: members } = await supabase
    .from("profiles")
    .select("id")
    .eq("department_id", departmentId)
    .eq("role", "admin");

  for (const member of members ?? []) {
    const { error } = await supabase
      .from("company_technicians")
      .insert({ company_id: companyId, technician_id: member.id });

    // Ignore duplicates
    if (error && error.code !== "23505") {
    console.error("[admin/departamento] assignAllMembers error:", error.code);
    throw new Error("Error al asignar miembros.");
  }
  }
}
