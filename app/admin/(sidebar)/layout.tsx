import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/sidebar/admin-sidebar";
import { getNotifications } from "@/lib/actions/notifications";

export default async function AdminSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  const [{ data: profile }, { data: profileRole }, { data: profileDepts }, allNotifications] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user.id).single(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("profile_departments").select("department:departments(id, name, slug)").eq("profile_id", user.id),
    getNotifications(),
  ]);

  const isSuperadmin = profileRole?.role === "superadmin";

  const departments = (profileDepts ?? [])
    .map((row) => {
      const d = row.department as unknown as { id: string; name: string; slug: string } | null;
      return d ? { id: d.id, name: d.name, slug: d.slug } : null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  // Fetch ALL services across ALL user's departments
  let hasTaxModels = isSuperadmin; // superadmin siempre tiene acceso a todos los servicios
  if (!isSuperadmin) {
    const deptIds = departments.map((d) => d.id);
    if (deptIds.length > 0) {
      const { data: allServices } = await supabase
        .from("department_services")
        .select("service:services(slug)")
        .in("department_id", deptIds)
        .eq("is_active", true);

      hasTaxModels = (allServices ?? []).some((ds) => {
        const svc = (ds as unknown as { service: { slug: string } | null }).service;
        return svc?.slug === "tax-models";
      });
    }
  }

  const unreadCount = allNotifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-gray">
      <AdminSidebar
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
