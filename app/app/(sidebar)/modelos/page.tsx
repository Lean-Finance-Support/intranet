import { redirect } from "next/navigation";
import { getActiveCompanyId } from "@/lib/active-company";
import { getLinkPrefix } from "@/lib/link-prefix";
import ModelosClientWorkspace from "./_components/modelos-client-workspace";
import {
  getAuthUser,
  getCachedCompanyServiceSlugs,
} from "@/lib/cached-queries";

export default async function ClientModelosPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const { user } = await getAuthUser();
  if (!user) redirect("/app/login");

  const [prefix, activeCompanyId, params] = await Promise.all([
    getLinkPrefix("app"),
    getActiveCompanyId(),
    searchParams,
  ]);
  if (!activeCompanyId) {
    redirect(`${prefix}/select-company`);
  }

  const slugs = await getCachedCompanyServiceSlugs(activeCompanyId);
  if (!slugs.includes("tax-models")) {
    redirect(`${prefix}/dashboard`);
  }

  const initialYear = Math.max(2020, parseInt(params.year ?? "") || new Date().getFullYear());
  const initialQuarter = Math.min(4, Math.max(1, parseInt(params.quarter ?? "") || 1));

  return (
    <div className="min-h-full">
      <ModelosClientWorkspace initialYear={initialYear} initialQuarter={initialQuarter} />
    </div>
  );
}
