import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/active-company";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 días
};

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const next = searchParams.get("next") ?? "/app/dashboard";

  if (!companyId) {
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/app/login", origin));
  }

  // Verificar que el usuario tiene acceso a esta empresa
  const { data: access } = await supabase
    .from("profile_companies")
    .select("company_id")
    .eq("profile_id", user.id)
    .eq("company_id", companyId)
    .single();

  if (!access) {
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, COOKIE_OPTIONS);

  return NextResponse.redirect(new URL(next, origin));
}
