import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getMyCompanies } from "./actions";
import { getLinkPrefix } from "@/lib/link-prefix";
import CompanySelector from "./company-selector";

export default async function SelectCompanyPage() {
  const supabase = await createClient();

  const [{ data: { user } }, prefix, companies] = await Promise.all([
    supabase.auth.getUser(),
    getLinkPrefix("app"),
    getMyCompanies(),
  ]);

  if (!user) redirect(`${prefix}/login`);

  if (companies.length === 0) redirect("/unauthorized");

  // Si solo tiene una empresa, auto-seleccionar y redirigir
  if (companies.length === 1) {
    const { setActiveCompanyIdInCookies } = await import("@/lib/active-company");
    await setActiveCompanyIdInCookies(companies[0].id);
    redirect(`${prefix}/dashboard`);
  }

  return (
    <main className="h-screen overflow-y-auto bg-brand-navy">
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <div className="max-w-lg w-full flex flex-col bg-white rounded-2xl shadow-sm max-h-[calc(100vh-4rem)]">
          <div className="text-center px-8 pt-8 pb-4 flex-shrink-0">
            <h1 className="text-2xl font-bold font-heading text-brand-navy mb-2">
              Selecciona un espacio
            </h1>
            <p className="text-text-muted text-sm">
              Tienes acceso a varios espacios. Elige con cuál quieres trabajar.
            </p>
          </div>
          <div className="overflow-y-auto px-8 pb-8 pt-2 flex-1 min-h-0">
            <CompanySelector companies={companies} linkPrefix={prefix} />
          </div>
        </div>
      </div>
    </main>
  );
}
