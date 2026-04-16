import Image from "next/image";
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
    <div className="min-h-screen bg-surface-gray flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Image
            src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png"
            alt="LeanFinance"
            width={279}
            height={96}
            className="h-20 w-auto mx-auto mb-6"
            priority
          />
          <h1 className="text-xl font-semibold text-brand-navy">
            Selecciona un espacio
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Tienes acceso a varios espacios. Elige con cuál quieres trabajar.
          </p>
        </div>
        <CompanySelector companies={companies} linkPrefix={prefix} />
      </div>
    </div>
  );
}
