import ClientesPage from "@/components/clientes-page";
import { getAllCompaniesData } from "@/app/admin/clientes/actions";
import { headers } from "next/headers";

export default async function AdminClientesPage() {
  const [data, headersList] = await Promise.all([
    getAllCompaniesData(),
    headers(),
  ]);

  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const linkPrefix = isProd ? "" : "/admin";

  return <ClientesPage data={data} linkPrefix={linkPrefix} />;
}
