import { getLinkPrefix } from "@/lib/link-prefix";
import { listServicesCatalog } from "./actions";
import ServicesWorkspace from "./_components/services-workspace";

export default async function AdminServiciosPage() {
  const [data, linkPrefix] = await Promise.all([
    listServicesCatalog(),
    getLinkPrefix("admin"),
  ]);
  return <ServicesWorkspace initial={data} linkPrefix={linkPrefix} />;
}
