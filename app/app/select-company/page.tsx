import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getMyCompanies } from "./actions";
import { setActiveCompanyCookieOnResponse } from "@/lib/active-company";
import CompanySelector from "./company-selector";

export default async function SelectCompanyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "app.leanfinance.es";
  const prefix = isProd ? "" : "/app";

  if (!user) redirect(`${prefix}/login`);

  const companies = await getMyCompanies();

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
          <img
            src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png"
            alt="LeanFinance"
            className="h-20 mx-auto mb-6"
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
