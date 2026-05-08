import ClientesPage from "@/components/clientes-page";
import { getAllCompaniesData } from "@/app/admin/clientes/actions";
import { getLinkPrefix } from "@/lib/link-prefix";
import { canViewClientDashboard } from "@/lib/dashboard-admin-access";

export default async function AdminClientesPage() {
  const [data, linkPrefix, canViewDashboard] = await Promise.all([
    getAllCompaniesData(),
    getLinkPrefix("admin"),
    canViewClientDashboard(),
  ]);

  return (
    <ClientesPage
      data={data}
      linkPrefix={linkPrefix}
      canViewDashboard={canViewDashboard}
    />
  );
}
