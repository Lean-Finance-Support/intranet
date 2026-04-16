import { redirect } from "next/navigation";
import { headers } from "next/headers";
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

  const [headersList, resolvedParams] = await Promise.all([
    headers(),
    searchParams,
  ]);

  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  const departments = await getCachedUserDepartments(user.id);
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
