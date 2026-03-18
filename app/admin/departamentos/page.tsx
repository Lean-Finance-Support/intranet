import { createClient } from "@/lib/supabase/server";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import DepartmentPicker from "./department-picker";

export default async function SuperadminDepartmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "superadmin") {
    redirect("/admin/dashboard");
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, slug")
    .order("name");

  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  // Check if there's already a selected department
  const cookieStore = await cookies();
  const currentDeptId = cookieStore.get("sa-department-id")?.value ?? null;

  return (
    <main className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      <div className="max-w-lg w-full space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
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
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <p className="text-brand-teal text-sm font-medium mb-1">
            Superadmin
          </p>
          <h1 className="text-2xl font-bold font-heading text-brand-navy mt-1 mb-2">
            Selecciona un departamento
          </h1>
          <p className="text-text-muted text-sm mb-6">
            {profile.full_name ?? profile.email ?? user.email}
          </p>

          <DepartmentPicker
            departments={departments ?? []}
            currentDeptId={currentDeptId}
            dashboardUrl={`${prefix}/dashboard`}
          />
        </div>
      </div>
      <LogoutButton loginPath={`${prefix}/login`} />
    </main>
  );
}
