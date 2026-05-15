import { loadActiveDeductions, loadInvitationByToken } from "@/lib/renta/catalog";
import { createAdminClient } from "@/lib/supabase/server";
import {
  fetchChiefsForDepartment,
  fetchTechniciansForService,
} from "@/lib/team-queries";
import { SERVICE_SLUGS } from "@/lib/types/services";
import RentaForm from "./_components/renta-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function RentaPublicPage({ params }: PageProps) {
  const { token } = await params;

  const invitation = await loadInvitationByToken(token);
  if (!invitation) {
    return <InvalidLink />;
  }

  // Cargamos TODAS las deducciones activas (el form filtra por CCAA tras el paso 2).
  const deductions = await loadActiveDeductions();

  // Emails de los técnicos del servicio para el botón "Contacta con tu asesor"
  // (chiefs del dpto como fallback, igual que el aviso de submission).
  const advisorEmails = await loadAdvisorEmails(invitation.company_id);

  return (
    <RentaForm
      token={token}
      companyId={invitation.company_id}
      invitationId={invitation.id}
      deductions={deductions}
      advisorEmails={advisorEmails}
    />
  );
}

/**
 * Resuelve los emails de los técnicos asignados al servicio "Declaración de la
 * renta" de la empresa. Si no hay técnicos asignados, cae a los chiefs de los
 * departamentos que ofrecen el servicio. Devuelve [] si no se encuentra nadie.
 */
async function loadAdvisorEmails(companyId: string): Promise<string[]> {
  const admin = createAdminClient();

  const { data: service } = await admin
    .from("services")
    .select("id")
    .eq("slug", SERVICE_SLUGS.DECLARACION_RENTA)
    .maybeSingle();
  if (!service?.id) return [];

  const emails = new Set<string>();

  const techs = await fetchTechniciansForService(admin, companyId, service.id);
  for (const t of techs) if (t.email) emails.add(t.email);

  if (emails.size === 0) {
    const { data: deptLinks } = await admin
      .from("department_services")
      .select("department_id")
      .eq("service_id", service.id);
    const deptIds = [...new Set((deptLinks ?? []).map((d) => d.department_id as string))];
    for (const deptId of deptIds) {
      const chiefs = await fetchChiefsForDepartment(admin, deptId);
      for (const c of chiefs) if (c.email) emails.add(c.email);
    }
  }

  return [...emails];
}

function InvalidLink() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
      <h1 className="text-xl font-semibold text-brand-navy mb-2">Enlace no válido</h1>
      <p className="text-sm text-text-muted">
        Este enlace ha caducado o ha sido revocado. Ponte en contacto con tu asesor de Lean Finance
        para que te facilite uno nuevo.
      </p>
    </div>
  );
}
