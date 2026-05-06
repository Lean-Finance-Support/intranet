import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission, userScopeIds } from "@/lib/require-permission";
import { getAuthUser } from "@/lib/cached-queries";
import {
  getAllCompaniesData,
  getCompanyDetail,
  getCompanyResponsibleTeamAction,
} from "@/app/admin/clientes/actions";
import { getLinkPrefix } from "@/lib/link-prefix";
import {
  getClientDocumentation,
  getAssignableCatalog,
} from "@/app/admin/clientes/[id]/documentation-actions";
import ClientDetailWorkspace from "./_components/client-detail-workspace";

interface Params {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminClientDetailPage({ params, searchParams }: Params) {
  await requireAdmin();
  const { id } = await params;
  const { tab } = await searchParams;
  const { user } = await getAuthUser();
  if (!user) notFound();

  const [
    detail,
    documentation,
    assignable,
    listing,
    linkPrefix,
    canValidateGlobal,
    supervisorClientApartadoIds,
    responsibleTeam,
  ] = await Promise.all([
    getCompanyDetail(id),
    getClientDocumentation(id),
    getAssignableCatalog(id),
    getAllCompaniesData(),
    getLinkPrefix("admin"),
    hasPermission("validate_documentation"),
    userScopeIds("validate_client_documentation", "client_apartado"),
    getCompanyResponsibleTeamAction(id),
  ]);

  if (!detail) notFound();

  const company = listing.companies.find((c) => c.id === id);
  if (!company) notFound();

  return (
    <div className="min-h-full px-8 pt-4 pb-8">
      <div className="max-w-6xl">
        <ClientDetailWorkspace
          detail={detail}
          company={company}
          userChiefDeptIds={listing.userChiefDeptIds}
          deptMembers={listing.deptMembers}
          chiefAvailableServices={listing.chiefAvailableServices}
          canCreateCompany={listing.canCreateCompany}
          canDeleteCompany={listing.canDeleteCompany}
          canManageClientAccounts={listing.canManageClientAccounts}
          canManageBankAccounts={listing.canManageBankAccounts}
          linkPrefix={linkPrefix}
          documentation={documentation}
          assignableCatalog={assignable}
          canValidateGlobal={canValidateGlobal}
          supervisorClientApartadoIds={supervisorClientApartadoIds}
          responsibleTeam={responsibleTeam}
          currentUserId={user.id}
          initialTab={tab ?? "documentacion"}
        />
      </div>
    </div>
  );
}
