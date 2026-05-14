import { redirect } from "next/navigation";
import { getLinkPrefix } from "@/lib/link-prefix";
import ModelosWorkspace from "./_components/modelos-workspace";
import {
  getAuthUser,
  getCachedProfile,
  getCachedUserServiceDepts,
  getCachedDepartmentServiceSlugs,
} from "@/lib/cached-queries";
import { SERVICE_SLUGS } from "@/lib/types/services";

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
    redirect(`${prefix}/inicio`);
  }

  const deptIds = departments.map((d) => d.id);
  if (deptIds.length === 0) redirect(`${prefix}/inicio`);

  const slugs = await getCachedDepartmentServiceSlugs(deptIds);
  if (!slugs.includes(SERVICE_SLUGS.TAX_ACCOUNTING_ADVICE)) redirect(`${prefix}/inicio`);

  return (
    <div className="min-h-full">
      <ModelosWorkspace initialCompanyId={resolvedParams.company} />
    </div>
  );
}
