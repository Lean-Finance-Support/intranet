import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ClientSidebar from "@/components/sidebar/client-sidebar";
import { getNotifications } from "@/lib/actions/notifications";
import { getActiveCompanyId } from "@/lib/active-company";

export default async function AppSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/app/login");

  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "app.leanfinance.es";
  const prefix = isProd ? "" : "/app";

  // Obtener empresa activa y lista de empresas del usuario
  const activeCompanyId = await getActiveCompanyId();

  const [{ data: profile }, { data: profileCompanies }, allNotifications] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profile_companies")
      .select("company:companies(id, legal_name, company_name)")
      .eq("profile_id", user.id),
    getNotifications(),
  ]);

  const companies = (profileCompanies ?? [])
    .map((row) => {
      const c = row.company as unknown as { id: string; legal_name: string; company_name: string | null } | null;
      return c ? { id: c.id, legal_name: c.legal_name, company_name: c.company_name } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Si no hay empresa activa, redirigir para que se setee la cookie
  if (!activeCompanyId) {
    if (companies.length === 1) {
      // Auto-seleccionar vía route handler (único lugar donde se puede escribir la cookie)
      redirect(`${prefix}/set-company?companyId=${companies[0].id}&next=${prefix}/dashboard`);
    } else if (companies.length === 0) {
      redirect("/unauthorized");
    } else {
      redirect(`${prefix}/select-company`);
    }
  }

  const resolvedCompanyId = activeCompanyId ?? companies[0]?.id;

  // Fetch company_services para la empresa activa
  const { data: companyServices } = resolvedCompanyId
    ? await supabase
        .from("company_services")
        .select("is_active, service:services(slug)")
        .eq("company_id", resolvedCompanyId)
    : { data: null };

  const hasTaxModels = (companyServices ?? []).some(
    (cs) => {
      const svc = cs.service as unknown as { slug: string } | null;
      return cs.is_active && svc?.slug === "tax-models";
    }
  );
  const unreadCount = allNotifications.filter((n) => !n.is_read).length;

  const activeCompany = companies.find((c) => c.id === resolvedCompanyId) ?? companies[0] ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-gray">
      <ClientSidebar
        profile={{
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? user.email ?? null,
        }}
        hasTaxModels={hasTaxModels}
        loginPath={`${prefix}/login`}
        linkPrefix={prefix}
        unreadCount={unreadCount}
        companies={companies}
        activeCompany={activeCompany}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
