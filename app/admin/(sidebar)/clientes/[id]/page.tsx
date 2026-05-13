import { Suspense } from "react";
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
import ClientHeaderShell from "./_components/client-header-shell";
import WorkspaceTabsSkeleton from "./_components/workspace-tabs-skeleton";

interface Params {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Estrategia de carga:
 *  1. Shell instantáneo (esta función): solo `requireAdmin` + `getCompanyDetail`
 *     (lookup por PK, ~30 ms) + `getLinkPrefix`. Pintamos breadcrumb + h1 con el
 *     nombre del cliente → el LCP de Vercel ya tiene un elemento grande YA.
 *  2. Resto del workspace (tabs + contenido) dentro de <Suspense>, lo carga
 *     `WorkspaceLoader` con todas las queries pesadas en paralelo.
 *
 * Sin este split, la página esperaba 11 queries antes de pintar nada — el
 * usuario veía solo el loading.tsx 1-2 s.
 */
export default async function AdminClientDetailPage({ params, searchParams }: Params) {
  await requireAdmin();
  const { id } = await params;
  const { tab } = await searchParams;
  const { user } = await getAuthUser();
  if (!user) notFound();

  const [detail, linkPrefix] = await Promise.all([
    getCompanyDetail(id),
    getLinkPrefix("admin"),
  ]);

  if (!detail) notFound();

  return (
    <div className="min-h-full px-8 pt-4 pb-8">
      <div className="max-w-screen-2xl">
        <ClientHeaderShell detail={detail} linkPrefix={linkPrefix} />
        <Suspense fallback={<WorkspaceTabsSkeleton />}>
          <WorkspaceLoader
            id={id}
            detail={detail}
            linkPrefix={linkPrefix}
            userId={user.id}
            initialTab={tab ?? "documentacion"}
          />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Server component perezoso: agrupa las 9 queries pesadas en un único
 * `Promise.all` y delega al workspace cliente. Se ejecuta DENTRO del Suspense,
 * así que mientras corre el usuario ya está viendo el header.
 */
async function WorkspaceLoader({
  id,
  detail,
  linkPrefix,
  userId,
  initialTab,
}: {
  id: string;
  detail: Awaited<ReturnType<typeof getCompanyDetail>>;
  linkPrefix: string;
  userId: string;
  initialTab: string;
}) {
  if (!detail) return null;
  const [
    documentation,
    assignable,
    context,
    canValidateGlobal,
    supervisorClientApartadoIds,
    responsibleTeam,
    dashboardConfig,
    canViewDashboard,
    canViewTaxModels,
  ] = await Promise.all([
    getClientDocumentation(id),
    getAssignableCatalog(id),
    getCompanyContextForDetail(id),
    hasPermission("validate_documentation"),
    userScopeIds("validate_client_documentation", "client_apartado"),
    getCompanyResponsibleTeamAction(id),
    getCompanyDashboardConfig(id),
    canViewClientDashboard(),
    canViewClientTaxModels(),
  ]);

  const dashboardAuthorizedEmail = process.env.DASHBOARD_AUTHORIZED_EMAIL ?? null;

  return (
    <ClientDetailWorkspace
      detail={detail}
      company={context.company}
      userChiefDeptIds={context.userChiefDeptIds}
      deptMembers={context.deptMembers}
      departments={context.departments}
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
      currentUserId={userId}
      initialTab={initialTab}
      dashboardConfig={dashboardConfig}
      dashboardAuthorizedEmail={dashboardAuthorizedEmail}
      canViewClientDashboard={canViewDashboard}
      canViewClientTaxModels={canViewTaxModels}
    />
  );
}
