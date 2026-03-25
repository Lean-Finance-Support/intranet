import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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
    <div className="min-h-full px-8 py-12">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-heading text-2xl text-brand-navy mb-8">
          Modelos de Prestación de Impuestos
        </h1>
        <ModelosWorkspace />
      </div>
    </div>
  );
}
