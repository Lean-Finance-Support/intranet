import { getLinkPrefix } from "@/lib/link-prefix";
import { listDocumentationCatalog } from "./actions";
import CatalogWorkspace from "./_components/catalog-workspace";

export default async function AdminDocumentacionPage() {
  const [data, linkPrefix] = await Promise.all([
    listDocumentationCatalog(),
    getLinkPrefix("admin"),
  ]);
  return <CatalogWorkspace initial={data} linkPrefix={linkPrefix} />;
}
