import { createClient } from "@/lib/supabase/server";
import { headers, cookies } from "next/headers";
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

  const [{ data: profile }, headersList, cookieStore] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, role, department_id, department:departments!profiles_department_id_fkey(name)")
      .eq("id", user.id)
      .single(),
    headers(),
    cookies(),
  ]);

  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  const isSuperadmin = profile?.role === "superadmin";
  let departmentId = profile?.department_id ?? null;

  if (isSuperadmin) {
    const saDeptId = cookieStore.get("sa-department-id")?.value;
    if (!saDeptId) redirect(`${prefix}/departamentos`);
    departmentId = saDeptId;
  }

  // Get department name, services, and unread count in parallel
  const [deptResult, servicesResult, allNotifications] = await Promise.all([
    isSuperadmin && departmentId
      ? supabase.from("departments").select("name").eq("id", departmentId).single()
      : Promise.resolve(null),
    departmentId
      ? supabase
          .from("department_services")
          .select("service:services(slug)")
          .eq("department_id", departmentId)
          .eq("is_active", true)
      : Promise.resolve(null),
    getNotifications(),
  ]);

  let departmentName: string | null = null;
  if (isSuperadmin) {
    departmentName = deptResult?.data?.name ?? null;
  } else {
    const dept = profile?.department as unknown as { name: string } | null;
    departmentName = dept?.name ?? null;
  }

  const serviceSlugs = (servicesResult?.data ?? []).map((ds) => {
    const svc = (ds as unknown as { service: { slug: string } | null }).service;
    return svc?.slug ?? "";
  }).filter(Boolean);

  const hasTaxModels = serviceSlugs.includes("tax-models");
  const unreadCount = allNotifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-gray">
      <AdminSidebar
        profile={{
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? user.email ?? null,
          role: profile?.role ?? "admin",
          department_name: departmentName,
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
