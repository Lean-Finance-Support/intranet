import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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

  const [{ data: profile }, headersList] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user.id).single(),
    headers(),
  ]);

  const { data: profileDepts } = await supabase
    .from("profile_departments")
    .select("department:departments(name)")
    .eq("profile_id", user.id);

  const departmentNames = (profileDepts ?? [])
    .map((row) => {
      const d = row.department as unknown as { name: string } | null;
      return d?.name ?? null;
    })
    .filter((n): n is string => n !== null);

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
        {departmentNames.length > 0 && (
          <p className="text-text-muted text-sm mt-2">
            {departmentNames.join(" · ")}
          </p>
        )}
        <div className="w-10 h-0.5 bg-brand-teal rounded-full mt-6" />
      </div>
    </div>
  );
}
