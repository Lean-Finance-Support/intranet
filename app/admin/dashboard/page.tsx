import { createClient } from "@/lib/supabase/server";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import NotificationsBell from "@/components/notifications-bell";
import LogoutButton from "@/components/logout-button";

const DepartmentInfoButton = dynamic(() => import("@/components/department-info-button"));

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  // Lanzar query de perfil y lectura de cookies en paralelo
  const [{ data: profile, error: profileError }, cookieStore] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, role, department_id, department:departments!profiles_department_id_fkey(name)")
      .eq("id", user.id)
      .single(),
    cookies(),
  ]);

  if (profileError) {
    console.error("[admin/dashboard] profile query error:", profileError);
  }

  const isSuperadmin = profile?.role === "superadmin";

  // Determinar departamento activo
  let departmentId = profile?.department_id ?? null;
  let departmentName: string | null = null;

  if (isSuperadmin) {
    const saDeptId = cookieStore.get("sa-department-id")?.value;
    if (!saDeptId) {
      redirect(`${prefix}/departamentos`);
    }
    departmentId = saDeptId;
  }

  // Lanzar query de nombre de departamento (solo superadmin) y servicios en paralelo
  const [deptResult, servicesResult] = await Promise.all([
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
  ]);

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

  return (
    <main className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      {/* Notifications bell - top right */}
      <div className="fixed top-4 right-4 z-50">
        <NotificationsBell linkPrefix={prefix} variant="light" />
      </div>

      <div className="max-w-md w-full space-y-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
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
            Portal de empleados
          </p>
          <h1 className="text-2xl font-bold font-heading text-brand-navy mt-1 mb-2">
            Bienvenido
          </h1>
          <p className="text-text-muted text-sm">
            {profile?.full_name ?? profile?.email ?? user.email}
          </p>
          {departmentName && (
            <p className="text-text-muted text-xs mt-1">
              {departmentName}
              {isSuperadmin && (
                <> · <Link href={`${prefix}/departamentos`} className="text-brand-teal hover:underline">Cambiar</Link></>
              )}
            </p>
          )}
        </div>

        {hasTaxModels && (
          <Link
            href={`${prefix}/modelos`}
            className="block bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow group"
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
                  Gestión trimestral de modelos tributarios
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
          </Link>
        )}
      </div>
      <DepartmentInfoButton />
      <LogoutButton loginPath={`${prefix}/login`} />
    </main>
  );
}
