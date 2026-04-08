import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import DepartmentPicker from "./department-picker";
import { getActiveDepartmentId } from "@/lib/active-department";

export default async function SelectDepartmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const [{ data: profile }, headersList] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, full_name, email")
      .eq("id", user.id)
      .single(),
    headers(),
  ]);

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    redirect("/admin/dashboard");
  }

  const isSuperadmin = profile.role === "superadmin";

  let departments: { id: string; name: string; slug: string }[] = [];

  if (isSuperadmin) {
    const { data: allDepts } = await supabase
      .from("departments")
      .select("id, name, slug")
      .order("name");
    departments = allDepts ?? [];
  } else {
    const { data: profileDepts } = await supabase
      .from("profile_departments")
      .select("department:departments(id, name, slug)")
      .eq("profile_id", user.id);
    departments = (profileDepts ?? [])
      .map((row) => row.department as unknown as { id: string; name: string; slug: string } | null)
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }

  // Si solo tiene 1, auto-seleccionar
  if (departments.length <= 1) {
    redirect("/admin/dashboard");
  }

  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  const currentDeptId = await getActiveDepartmentId();

  return (
    <main className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      <div className="max-w-lg w-full space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <Image
            src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png"
            alt="LeanFinance"
            width={279}
            height={96}
            className="h-8 w-auto mx-auto mb-6"
            priority
          />
          <h1 className="text-2xl font-bold font-heading text-brand-navy mt-1 mb-2">
            Selecciona un espacio
          </h1>
          <p className="text-text-muted text-sm mb-6">
            {profile.full_name ?? profile.email ?? user.email}
          </p>

          <DepartmentPicker
            departments={departments}
            currentDeptId={currentDeptId}
            dashboardUrl={`${prefix}/dashboard`}
          />
        </div>
      </div>
      <LogoutButton loginPath={`${prefix}/login`} />
    </main>
  );
}
