import { loadActiveDeductions, loadInvitationByToken } from "@/lib/renta/catalog";
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

  return (
    <RentaForm
      token={token}
      companyId={invitation.company_id}
      invitationId={invitation.id}
      deductions={deductions}
    />
  );
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
