import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getActiveCompanyId } from "@/lib/active-company";
import ModelosClientWorkspace from "./_components/modelos-client-workspace";
import {
  getAuthUser,
  getCachedCompanyServiceSlugs,
} from "@/lib/cached-queries";

export default async function ClientModelosPage() {
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
  if (!slugs.includes("tax-models")) {
    redirect(`${prefix}/dashboard`);
  }

  return (
    <div className="min-h-full px-8 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-heading text-2xl text-brand-navy mb-8">
          Modelos de Prestación de Impuestos
        </h1>
        <ModelosClientWorkspace />
      </div>
    </div>
  );
}
