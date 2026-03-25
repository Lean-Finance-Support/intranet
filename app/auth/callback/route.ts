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

  // Comprobar si el usuario tiene perfil creado (no es auto-registro)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // Usuario sin perfil → no está dado de alta en el sistema.
    // Cerrar sesión y limpiar cookies manualmente para evitar loops.
    await supabase.auth.signOut();
    const response = NextResponse.redirect(
      new URL("/unauthorized", origin)
    );
    // Eliminar todas las cookies de Supabase para asegurar que la sesión queda cerrada
    cookieStore.getAll().forEach((cookie) => {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.delete(cookie.name);
      }
    });
    return response;
  }

  // Redirigir al dashboard del espacio correcto según el rol.
  const isAdminHost = request.headers.get("host")?.startsWith("admin.");
  const isAppHost = request.headers.get("host")?.startsWith("app.");
  const isProd = isAdminHost || isAppHost;

  if (profile.role === "admin" || profile.role === "superadmin") {
    if (isProd) {
      const adminUrl =
        process.env.NEXT_PUBLIC_ADMIN_URL || origin;
      return NextResponse.redirect(`${adminUrl}/dashboard`);
    }
    return NextResponse.redirect(new URL("/admin/dashboard", origin));
  }

  // Cliente: consultar empresas asociadas en profile_companies
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

  // Múltiples empresas → página de selección
  const appUrl = isProd ? (process.env.NEXT_PUBLIC_APP_URL || origin) : origin;
  return NextResponse.redirect(new URL(`${appPrefix}/select-company`, appUrl));
}
