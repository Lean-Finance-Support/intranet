import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/require-permission";
import { loadBulkAssignmentData } from "./actions";
import BulkAssignWorkspace from "./_components/bulk-assign-workspace";

export default async function AsignacionMultiplePage() {
  if (!(await hasPermission("request_client_documentation"))) {
    redirect("/admin/documentacion");
  }
  const data = await loadBulkAssignmentData();
  return <BulkAssignWorkspace data={data} />;
}
