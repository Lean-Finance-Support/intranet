import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, company_id")
    .eq("id", user.id)
    .single();

  // Fetch services contracted by this client's company
  let serviceSlugs: string[] = [];
  if (profile?.company_id) {
    const { data } = await supabase
      .from("company_services")
      .select("service:services(slug)")
      .eq("company_id", profile.company_id)
      .eq("is_active", true);
    serviceSlugs = (data ?? [])
      .map((cs) => {
        const svc = cs.service as unknown as { slug: string } | null;
        return svc?.slug ?? "";
      })
      .filter(Boolean);
  }

  const hasTaxModels = serviceSlugs.includes("tax-models");

  return (
    <main className="min-h-screen bg-surface-gray flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-4">
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
          <h1 className="text-2xl font-bold font-heading text-brand-navy mt-1 mb-2">
            Bienvenido
          </h1>
          <p className="text-text-muted text-sm">
            {profile?.full_name ?? profile?.email ?? user.email}
          </p>
        </div>

        {hasTaxModels && (
          <a
            href={`${prefix}/modelos`}
            className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow group"
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
                <p className="text-sm text-text-muted">
                  Consulta y valida tus modelos tributarios
                </p>
              </div>
              <svg
                className="w-5 h-5 text-text-muted group-hover:text-brand-teal transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </a>
        )}
      </div>
    </main>
  );
}
