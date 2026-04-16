import { redirect } from "next/navigation";
import { headers } from "next/headers";
import ModelosWorkspace from "./_components/modelos-workspace";
import {
  getAuthUser,
  getCachedProfile,
  getCachedUserDepartments,
  getCachedDepartmentServiceSlugs,
} from "@/lib/cached-queries";

export default async function ModelosPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { user } = await getAuthUser();
  if (!user) redirect("/admin/login");

  const [profile, departments, headersList, resolvedParams] = await Promise.all([
    getCachedProfile(user.id),
    getCachedUserDepartments(user.id),
    headers(),
    searchParams,
  ]);

  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  if (!profile || profile.role !== "admin") {
    redirect(`${prefix}/dashboard`);
  }

  const deptIds = departments.map((d) => d.id);
  if (deptIds.length === 0) redirect(`${prefix}/dashboard`);

  const slugs = await getCachedDepartmentServiceSlugs(deptIds);
  if (!slugs.includes("tax-models")) redirect(`${prefix}/dashboard`);

  return (
    <div className="min-h-full">
      <ModelosWorkspace initialCompanyId={resolvedParams.company} />
    </div>
  );
}
