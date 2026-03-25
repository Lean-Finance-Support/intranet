import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompanyId } from "@/lib/active-company";
import ModelosClientWorkspace from "./_components/modelos-client-workspace";

export default async function ClientModelosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/app/login");

  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "app.leanfinance.es";
  const prefix = isProd ? "" : "/app";

  const activeCompanyId = await getActiveCompanyId();
  if (!activeCompanyId) {
    redirect(`${prefix}/select-company`);
  }

  // Verificar que el servicio tax-models está activo para la empresa activa
  const { data: companyServices } = await supabase
    .from("company_services")
    .select("is_active, service:services(slug)")
    .eq("company_id", activeCompanyId);

  const hasTaxModels = (companyServices ?? []).some(
    (cs) => {
      const svc = cs.service as unknown as { slug: string } | null;
      return cs.is_active && svc?.slug === "tax-models";
    }
  );

  if (!hasTaxModels) {
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
