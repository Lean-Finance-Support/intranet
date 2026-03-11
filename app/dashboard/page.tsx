import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-surface-gray flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
        <span className="text-brand-teal text-4xl">✓</span>
        <h1 className="text-2xl font-bold font-heading text-brand-navy mt-4 mb-2">
          Bienvenido
        </h1>
        <p className="text-text-muted text-sm">{user.email}</p>
      </div>
    </main>
  );
}
