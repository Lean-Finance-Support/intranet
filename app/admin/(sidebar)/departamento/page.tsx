import DepartamentoPage from "@/components/departamento-page";
import { getAllTeams } from "@/app/admin/departamento/actions";
import {
  backofficeGrantMaxLevel,
  getCurrentUserDelegations,
} from "@/app/admin/departamento/permissions-actions";
import { userScopeIds } from "@/lib/require-permission";

export default async function AdminDepartamentoPage() {
  const [
    departments,
    delegations,
    currentUserDeptIds,
    manageMembershipDeptIds,
    backofficeMaxLevel,
  ] = await Promise.all([
    getAllTeams(),
    getCurrentUserDelegations(),
    userScopeIds("read_dept_service", "department"),
    userScopeIds("manage_dept_membership", "department"),
    backofficeGrantMaxLevel(),
  ]);

  return (
    <DepartamentoPage
      departments={departments}
      currentUserDeptIds={currentUserDeptIds}
      manageMembershipDeptIds={manageMembershipDeptIds}
      delegations={delegations}
      backofficeMaxLevel={backofficeMaxLevel}
    />
  );
}
