import { redirect } from "next/navigation";
import { getLinkPrefix } from "@/lib/link-prefix";
import {
  getAuthUser,
  getCachedUserDepartments,
  getCachedDepartmentServiceSlugs,
} from "@/lib/cached-queries";
import EnisaAdminWorkspace from "./_components/enisa-admin-workspace";

export default async function AdminEnisaPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { user } = await getAuthUser();
  if (!user) redirect("/admin/login");

  const [prefix, resolvedParams, departments] = await Promise.all([
    getLinkPrefix("admin"),
    searchParams,
    getCachedUserDepartments(user.id),
  ]);

  const deptIds = departments.map((d) => d.id);
  if (deptIds.length === 0) redirect(`${prefix}/dashboard`);

  const slugs = await getCachedDepartmentServiceSlugs(deptIds);
  if (!slugs.includes("enisa-docs")) {
    redirect(`${prefix}/dashboard`);
  }

  return (
    <div className="min-h-full">
      <EnisaAdminWorkspace initialCompanyId={resolvedParams.company} />
    </div>
  );
}
