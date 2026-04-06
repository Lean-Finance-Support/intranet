import { redirect } from "next/navigation";
import {
  getAuthUser,
  getCachedProfile,
  getCachedUserDepartments,
} from "@/lib/cached-queries";

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
  const { user } = await getAuthUser();
  if (!user) redirect("/login");

  const [profile, departments] = await Promise.all([
    getCachedProfile(user.id),
    getCachedUserDepartments(user.id),
  ]);

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
        {departments.length > 0 && (
          <p className="text-text-muted text-sm mt-2">
            {departments.map((d) => d.name).join(" · ")}
          </p>
        )}
        <div className="w-10 h-0.5 bg-brand-teal rounded-full mt-6" />
      </div>
    </div>
  );
}
