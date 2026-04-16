import { redirect } from "next/navigation";
import { getActiveCompanyId } from "@/lib/active-company";
import { getLinkPrefix } from "@/lib/link-prefix";
import {
  getAuthUser,
  getCachedCompanyServiceSlugs,
} from "@/lib/cached-queries";
import EnisaClientWorkspace from "./_components/enisa-client-workspace";

export default async function ClientEnisaPage() {
  const { user } = await getAuthUser();
  if (!user) redirect("/app/login");

  const [prefix, activeCompanyId] = await Promise.all([
    getLinkPrefix("app"),
    getActiveCompanyId(),
  ]);
  if (!activeCompanyId) {
    redirect(`${prefix}/select-company`);
  }

  const slugs = await getCachedCompanyServiceSlugs(activeCompanyId);
  if (!slugs.includes("enisa-docs")) {
    redirect(`${prefix}/dashboard`);
  }

  return (
    <div className="min-h-full">
      <EnisaClientWorkspace />
    </div>
  );
}
