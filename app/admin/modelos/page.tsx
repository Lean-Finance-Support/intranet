import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import ModelosWorkspace from "./_components/modelos-workspace";

export default async function ModelosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  // Perfil, headers y cookies en paralelo
  const [{ data: profile }, headersList, cookieStore] = await Promise.all([
    supabase.from("profiles").select("role, department_id").eq("id", user.id).single(),
    headers(),
    cookies(),
  ]);

  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    redirect(`${prefix}/dashboard`);
  }

  // Superadmin uses cookie-based department
  let departmentId = profile.department_id;
  if (profile.role === "superadmin") {
    departmentId = cookieStore.get("sa-department-id")?.value ?? null;
  }

  if (!departmentId) {
    redirect(`${prefix}/dashboard`);
  }

  // Check if this department has the tax-models service
  const { data: departmentService } = await supabase
    .from("department_services")
    .select("id, service:services(slug)")
    .eq("department_id", departmentId)
    .eq("is_active", true)
    .eq("services.slug", "tax-models")
    .not("service", "is", null)
    .maybeSingle();

  if (!departmentService) {
    redirect(`${prefix}/dashboard`);
  }

  return (
    <div className="min-h-screen bg-brand-navy">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href={`${prefix}/dashboard`}
            className="text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-heading text-2xl text-white">
            Modelos de Prestación de Impuestos
          </h1>
        </div>

        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <ModelosWorkspace />
        </div>
      </div>
    </div>
  );
}
