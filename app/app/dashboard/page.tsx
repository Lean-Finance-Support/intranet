import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ClientDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  return (
    <main className="min-h-screen bg-surface-gray flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
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
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <p className="text-brand-teal text-sm font-medium mb-1">
          Portal de clientes
        </p>
        <h1 className="text-2xl font-bold font-heading text-brand-navy mt-1 mb-2">
          Bienvenido
        </h1>
        <p className="text-text-muted text-sm">
          {profile?.full_name ?? profile?.email ?? user.email}
        </p>
      </div>
    </main>
  );
}
