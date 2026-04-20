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
    <main className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      <div className="max-w-lg w-full space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold font-heading text-brand-navy mb-2">
              Selecciona un espacio
            </h1>
            <p className="text-text-muted text-sm mb-6">
              Tienes acceso a varios espacios. Elige con cuál quieres trabajar.
            </p>
          </div>
          <CompanySelector companies={companies} linkPrefix={prefix} />
        </div>
      </div>
    </main>
  );
}
