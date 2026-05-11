import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import DepartmentPicker from "./department-picker";
import { getActiveDepartmentId } from "@/lib/active-department";
import { getCachedProfile, getCachedUserDepartments } from "@/lib/cached-queries";
import { getLinkPrefix } from "@/lib/link-prefix";

export default async function SelectDepartmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const [profile, departments, prefix, currentDeptId] = await Promise.all([
    getCachedProfile(user.id),
    getCachedUserDepartments(user.id),
    getLinkPrefix("admin"),
    getActiveDepartmentId(),
  ]);

  if (!profile || profile.role !== "admin") {
    redirect("/admin/inicio");
  }

  // Si solo tiene 1, auto-seleccionar
  if (departments.length <= 1) {
    redirect("/admin/inicio");
  }

  return (
    <main className="h-screen overflow-y-auto bg-brand-navy">
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <div className="max-w-lg w-full flex flex-col bg-white rounded-2xl shadow-sm max-h-[calc(100vh-4rem)]">
          <div className="text-center px-8 pt-8 pb-4 flex-shrink-0">
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
            <p className="text-text-muted text-sm">
              {profile.full_name ?? profile.email ?? user.email}
            </p>
          </div>
          <div className="overflow-y-auto px-8 pb-8 pt-2 flex-1 min-h-0">
            <DepartmentPicker
              departments={departments}
              currentDeptId={currentDeptId}
              dashboardUrl={`${prefix}/inicio`}
            />
          </div>
        </div>
      </div>
      <LogoutButton loginPath={`${prefix}/login`} />
    </main>
  );
}
