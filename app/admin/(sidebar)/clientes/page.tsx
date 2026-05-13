import ClientesPage from "@/components/clientes-page";
import { getAllCompaniesData } from "@/app/admin/clientes/actions";
import { getLinkPrefix } from "@/lib/link-prefix";
import { canViewClientTaxModels } from "@/lib/dashboard-admin-access";

export default async function AdminClientesPage() {
  const [data, linkPrefix, canViewTaxModels] = await Promise.all([
    getAllCompaniesData(),
    getLinkPrefix("admin"),
    canViewClientTaxModels(),
  ]);

  return (
    <ClientesPage
      data={data}
      linkPrefix={linkPrefix}
      canViewTaxModels={canViewTaxModels}
    />
  );
}
