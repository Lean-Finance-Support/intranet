import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import ModelosWorkspace from "./_components/modelos-workspace";

export default async function ModelosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const [{ data: profile }, headersList] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    headers(),
  ]);

  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";
  const prefix = isProd ? "" : "/admin";

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    redirect(`${prefix}/dashboard`);
  }

  const isSuperadmin = profile.role === "superadmin";

  if (!isSuperadmin) {
    // Check if ANY of the user's departments has the tax-models service active
    const { data: userDepts } = await supabase
      .from("profile_departments")
      .select("department_id")
      .eq("profile_id", user.id);

    const deptIds = (userDepts ?? []).map((d) => d.department_id as string);

    if (deptIds.length === 0) redirect(`${prefix}/dashboard`);

    const { data: deptServices } = await supabase
      .from("department_services")
      .select("service:services(slug)")
      .in("department_id", deptIds)
      .eq("is_active", true);

    const hasTaxModels = (deptServices ?? []).some((ds) => {
      const svc = (ds as unknown as { service: { slug: string } | null }).service;
      return svc?.slug === "tax-models";
    });

    if (!hasTaxModels) redirect(`${prefix}/dashboard`);
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
