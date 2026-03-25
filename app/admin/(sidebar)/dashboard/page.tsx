import { createClient } from "@/lib/supabase/server";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function getFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  return fullName.split(" ")[0];
}

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

  const [{ data: profile }, cookieStore] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, role, department:departments!profiles_department_id_fkey(name)")
      .eq("id", user.id)
      .single(),
    cookies(),
  ]);

  const isSuperadmin = profile?.role === "superadmin";
  let departmentName: string | null = null;

  if (isSuperadmin) {
    const saDeptId = cookieStore.get("sa-department-id")?.value;
    if (!saDeptId) redirect(`${prefix}/departamentos`);
    const { data: dept } = await supabase
      .from("departments")
      .select("name")
      .eq("id", saDeptId)
      .single();
    departmentName = dept?.name ?? null;
  } else {
    const dept = profile?.department as unknown as { name: string } | null;
    departmentName = dept?.name ?? null;
  }

  const greeting = getGreeting();
  const firstName = getFirstName(profile?.full_name);
  const displayName = firstName ?? profile?.email ?? user.email;

  return (
    <div className="min-h-full px-8 py-12">
      <div className="max-w-2xl">
        <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
        <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
          {greeting}{displayName ? `, ${displayName}` : ""}
        </h1>
        {departmentName && (
          <p className="text-text-muted text-sm mt-2">
            {departmentName}
            {isSuperadmin && (
              <> · <Link href={`${prefix}/departamentos`} className="text-brand-teal hover:underline">Cambiar</Link></>
            )}
          </p>
        )}
        <div className="w-10 h-0.5 bg-brand-teal rounded-full mt-6" />
      </div>
    </div>
  );
}
