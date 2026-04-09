import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  getAuthUser,
  getCachedProfile,
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

  const profile = await getCachedProfile(user.id);
  const isSuperadmin = profile?.role === "superadmin";

  if (!isSuperadmin) {
    const departments = await getCachedUserDepartments(user.id);
    const deptIds = departments.map((d) => d.id);
    if (deptIds.length === 0) redirect(`${prefix}/dashboard`);

    const slugs = await getCachedDepartmentServiceSlugs(deptIds);
    if (!slugs.includes("enisa-docs")) {
      redirect(`${prefix}/dashboard`);
    }
  }

  return (
    <div className="min-h-full px-4 sm:px-8 py-8 sm:py-12">
      <div className="max-w-5xl mx-auto">
        <h1 className="font-heading text-2xl text-brand-navy mb-8">
          Documentación ENISA
        </h1>
        <EnisaAdminWorkspace initialCompanyId={resolvedParams.company} />
      </div>
    </div>
  );
}
