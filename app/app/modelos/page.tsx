import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
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
    <div className="min-h-screen bg-surface-gray">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href={`${prefix}/dashboard`}
            className="text-text-muted hover:text-brand-navy transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-heading text-2xl text-brand-navy">
            Modelos de Prestación de Impuestos
          </h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
          <ModelosClientWorkspace />
        </div>
      </div>
    </div>
  );
}
