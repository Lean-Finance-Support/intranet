import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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

  // Una sola query: perfil + servicios de la empresa con join
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id, company:companies!profiles_company_id_fkey(company_services(is_active, service:services(slug)))")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "client" || !profile.company_id) {
    redirect(`${prefix}/dashboard`);
  }

  const company = profile.company as unknown as {
    company_services: { is_active: boolean; service: { slug: string } | null }[];
  } | null;
  const hasTaxModels = (company?.company_services ?? []).some(
    (cs) => cs.is_active && cs.service?.slug === "tax-models"
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
