import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission, userScopeIds } from "@/lib/require-permission";
import {
  canViewClientDashboard,
  canViewClientTaxModels,
} from "@/lib/dashboard-admin-access";
import { getAuthUser } from "@/lib/cached-queries";
import {
  getCompanyContextForDetail,
  getCompanyDashboardConfig,
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
    context,
    linkPrefix,
    canValidateGlobal,
    supervisorClientApartadoIds,
    responsibleTeam,
    dashboardConfig,
    canViewDashboard,
    canViewTaxModels,
  ] = await Promise.all([
    getCompanyDetail(id),
    getClientDocumentation(id),
    getAssignableCatalog(id),
    getCompanyContextForDetail(id),
    getLinkPrefix("admin"),
    hasPermission("validate_documentation"),
    userScopeIds("validate_client_documentation", "client_apartado"),
    getCompanyResponsibleTeamAction(id),
    getCompanyDashboardConfig(id),
    canViewClientDashboard(),
    canViewClientTaxModels(),
  ]);

  const dashboardAuthorizedEmail = process.env.DASHBOARD_AUTHORIZED_EMAIL ?? null;

  if (!detail) notFound();

  return (
    <div className="min-h-full px-8 pt-4 pb-8">
      <div className="max-w-screen-2xl">
        <ClientDetailWorkspace
          detail={detail}
          company={context.company}
          userChiefDeptIds={context.userChiefDeptIds}
          deptMembers={context.deptMembers}
          allAdminCandidates={context.allAdminCandidates}
          chiefAvailableServices={context.chiefAvailableServices}
          canCreateCompany={context.canCreateCompany}
          canDeleteCompany={context.canDeleteCompany}
          canManageClientAccounts={context.canManageClientAccounts}
          canManageBankAccounts={context.canManageBankAccounts}
          linkPrefix={linkPrefix}
          documentation={documentation}
          assignableCatalog={assignable}
          canValidateGlobal={canValidateGlobal}
          supervisorClientApartadoIds={supervisorClientApartadoIds}
          responsibleTeam={responsibleTeam}
          currentUserId={user.id}
          initialTab={tab ?? "documentacion"}
          dashboardConfig={dashboardConfig}
          dashboardAuthorizedEmail={dashboardAuthorizedEmail}
          canViewClientDashboard={canViewDashboard}
          canViewClientTaxModels={canViewTaxModels}
        />
      </div>
    </div>
  );
}
