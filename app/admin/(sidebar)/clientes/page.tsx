import ClientesPage from "@/components/clientes-page";
import { getAllCompaniesData } from "@/app/admin/clientes/actions";
import { getLinkPrefix } from "@/lib/link-prefix";
import {
  canViewClientDashboard,
  canViewClientTaxModels,
} from "@/lib/dashboard-admin-access";

export default async function AdminClientesPage() {
  const [data, linkPrefix, canViewDashboard, canViewTaxModels] = await Promise.all([
    getAllCompaniesData(),
    getLinkPrefix("admin"),
    canViewClientDashboard(),
    canViewClientTaxModels(),
  ]);

  return (
    <ClientesPage
      data={data}
      linkPrefix={linkPrefix}
      canViewDashboard={canViewDashboard}
      canViewTaxModels={canViewTaxModels}
    />
  );
}
