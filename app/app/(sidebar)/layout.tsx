import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ClientSidebar from "@/components/sidebar/client-sidebar";
import { getNotifications } from "@/lib/actions/notifications";

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

  const [{ data: profile }, headersList, allNotifications] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, company_id, company:companies!profiles_company_id_fkey(company_services(is_active, service:services(slug)))")
      .eq("id", user.id)
      .single(),
    headers(),
    getNotifications(),
  ]);

  const host = headersList.get("host") ?? "";
  const isProd = host === "app.leanfinance.es";
  const prefix = isProd ? "" : "/app";

  const company = profile?.company as unknown as {
    company_services: { is_active: boolean; service: { slug: string } | null }[];
  } | null;
  const hasTaxModels = (company?.company_services ?? []).some(
    (cs) => cs.is_active && cs.service?.slug === "tax-models"
  );
  const unreadCount = allNotifications.filter((n) => !n.is_read).length;

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
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
