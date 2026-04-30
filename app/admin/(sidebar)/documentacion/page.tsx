import { listDocumentationCatalog } from "./actions";
import CatalogWorkspace from "./_components/catalog-workspace";

export default async function AdminDocumentacionPage() {
  const data = await listDocumentationCatalog();
  return <CatalogWorkspace initial={data} />;
}
