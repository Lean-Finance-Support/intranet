import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getActiveCompanyId } from "@/lib/active-company";
import {
  getAuthUser,
  getCachedCompanyServiceSlugs,
} from "@/lib/cached-queries";
import EnisaClientWorkspace from "./_components/enisa-client-workspace";

export default async function ClientEnisaPage() {
  const { user } = await getAuthUser();
  if (!user) redirect("/app/login");

  const [headersList, activeCompanyId] = await Promise.all([
    headers(),
    getActiveCompanyId(),
  ]);
  const host = headersList.get("host") ?? "";
  const isProd = host === "app.leanfinance.es";
  const prefix = isProd ? "" : "/app";
  if (!activeCompanyId) {
    redirect(`${prefix}/select-company`);
  }

  const slugs = await getCachedCompanyServiceSlugs(activeCompanyId);
  if (!slugs.includes("enisa-docs")) {
    redirect(`${prefix}/dashboard`);
  }

  return (
    <div className="min-h-full px-4 sm:px-8 py-8 sm:py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-heading text-2xl text-brand-navy mb-8">
          Documentación ENISA
        </h1>
        <EnisaClientWorkspace />
      </div>
    </div>
  );
}
