import { redirect } from "next/navigation";
import { getLinkPrefix } from "@/lib/link-prefix";
import ModelosWorkspace from "./_components/modelos-workspace";
import {
  getAuthUser,
  getCachedProfile,
  getCachedUserServiceDepts,
  getCachedDepartmentServiceSlugs,
} from "@/lib/cached-queries";

export default async function ModelosPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { user } = await getAuthUser();
  if (!user) redirect("/admin/login");

  const [profile, departments, prefix, resolvedParams] = await Promise.all([
    getCachedProfile(user.id),
    getCachedUserServiceDepts(user.id),
    getLinkPrefix("admin"),
    searchParams,
  ]);

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
