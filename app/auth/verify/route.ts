import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Esta ruta la usa el flujo GIS (signInWithIdToken).
// La sesión ya está establecida en el cliente; aquí solo verificamos
// el perfil y redirigimos al espacio correcto según el rol.

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  // Comprobar si el usuario tiene perfil creado manualmente por un admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // Usuario sin perfil → cerrar sesión y limpiar cookies para evitar loops
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

  // Redirigir al dashboard del espacio correcto según el rol
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

  if (isProd) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin;
    return NextResponse.redirect(`${appUrl}/dashboard`);
  }
  return NextResponse.redirect(new URL("/app/dashboard", origin));
}
