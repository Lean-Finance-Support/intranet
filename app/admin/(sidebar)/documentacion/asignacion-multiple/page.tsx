import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/require-permission";
import { getLinkPrefix } from "@/lib/link-prefix";
import { loadBulkAssignmentData } from "./actions";
import BulkAssignWorkspace from "./_components/bulk-assign-workspace";

export default async function AsignacionMultiplePage() {
  const linkPrefix = await getLinkPrefix("admin");
  if (!(await hasPermission("request_client_documentation"))) {
    redirect(`${linkPrefix}/documentacion`);
  }
  const data = await loadBulkAssignmentData();
  return <BulkAssignWorkspace data={data} linkPrefix={linkPrefix} />;
}
