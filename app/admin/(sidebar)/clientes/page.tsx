import ClientesPage from "@/components/clientes-page";
import { getAllCompaniesData } from "@/app/admin/clientes/actions";
import { getLinkPrefix } from "@/lib/link-prefix";

export default async function AdminClientesPage() {
  const [data, linkPrefix] = await Promise.all([
    getAllCompaniesData(),
    getLinkPrefix("admin"),
  ]);

  return <ClientesPage data={data} linkPrefix={linkPrefix} />;
}
