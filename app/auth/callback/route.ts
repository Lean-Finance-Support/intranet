import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    const response = NextResponse.redirect(
      new URL("/unauthorized", origin)
    );
    cookieStore.getAll().forEach((cookie) => {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.delete(cookie.name);
      }
    });
    return response;
  }

  const isAdminHost = request.headers.get("host")?.startsWith("admin.");
  const isAppHost = request.headers.get("host")?.startsWith("app.");
  const isProd = isAdminHost || isAppHost;

  if (profile.role === "admin") {
    const adminPrefix = isProd ? "" : "/admin";
    const adminUrl = isProd ? (process.env.NEXT_PUBLIC_ADMIN_URL || origin) : origin;
    return NextResponse.redirect(new URL(`${adminPrefix}/dashboard`, adminUrl));
  }

  // Cliente: consultar empresas asociadas
  const { data: profileCompanies } = await supabase
    .from("profile_companies")
    .select("company_id")
    .eq("profile_id", user.id);

  const companies = profileCompanies ?? [];

  if (companies.length === 0) {
    await supabase.auth.signOut();
    const response = NextResponse.redirect(new URL("/unauthorized", origin));
    cookieStore.getAll().forEach((cookie) => {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.delete(cookie.name);
      }
    });
    return response;
  }

  const appPrefix = isProd ? "" : "/app";

  if (companies.length === 1) {
    const { setActiveCompanyCookieOnResponse } = await import("@/lib/active-company");
    const appUrl = isProd ? (process.env.NEXT_PUBLIC_APP_URL || origin) : origin;
    const response = NextResponse.redirect(new URL(`${appPrefix}/dashboard`, appUrl));
    setActiveCompanyCookieOnResponse(response, companies[0].company_id);
    return response;
  }

  const appUrl = isProd ? (process.env.NEXT_PUBLIC_APP_URL || origin) : origin;
  return NextResponse.redirect(new URL(`${appPrefix}/select-company`, appUrl));
}
