import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import NotificationsBell from "@/components/notifications-bell";
import LogoutButton from "@/components/logout-button";

const CompanyInfoButton = dynamic(() => import("@/components/company-info-button"));

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function getFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  return fullName.split(" ")[0];
}

export default async function ClientDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "app.leanfinance.es";
  const prefix = isProd ? "" : "/app";

  // Perfil + servicios de la empresa en paralelo (perfil incluye company_id para el join)
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, company_id, company:companies!profiles_company_id_fkey(company_services(is_active, service:services(slug)))")
    .eq("id", user.id)
    .single();

  const company = profile?.company as unknown as {
    company_services: { is_active: boolean; service: { slug: string } | null }[];
  } | null;
  const serviceSlugs = (company?.company_services ?? [])
    .filter((cs) => cs.is_active)
    .map((cs) => cs.service?.slug ?? "")
    .filter(Boolean);

  const hasTaxModels = serviceSlugs.includes("tax-models");

  const greeting = getGreeting();
  const firstName = getFirstName(profile?.full_name);
  const displayName = firstName ?? profile?.email ?? user.email;

  return (
    <main className="min-h-screen bg-surface-gray flex items-center justify-center px-4">
      {/* Notifications bell - top right */}
      <div className="fixed top-4 right-4 z-50">
        <NotificationsBell linkPrefix={prefix} variant="dark" />
      </div>

      <div className="max-w-md w-full flex flex-col gap-4 stagger-children">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-brand-teal"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-brand-teal text-sm font-medium mb-1">
            Portal de clientes
          </p>
          <h1 className="text-2xl font-bold font-heading text-brand-navy tracking-tight mt-1 mb-1">
            {greeting}{displayName ? "," : ""}
          </h1>
          {displayName && (
            <p className="text-xl font-heading text-brand-navy font-semibold mb-2">
              {displayName}
            </p>
          )}
        </div>

        {hasTaxModels && (
          <Link
            href={`${prefix}/modelos`}
            className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-brand-teal"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-text-body group-hover:text-brand-teal transition-colors">
                  Modelos de Prestación de Impuestos
                </p>
                <p className="text-sm text-text-muted leading-relaxed">
                  Consulta y valida tus modelos tributarios
                </p>
              </div>
              <svg
                className="w-5 h-5 text-text-muted group-hover:text-brand-teal group-hover:translate-x-0.5 transition-all duration-200"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        )}
      </div>
      <CompanyInfoButton />
      <LogoutButton loginPath={`${prefix}/login`} />
    </main>
  );
}
