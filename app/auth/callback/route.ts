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
  // Usamos rutas relativas al origin para que funcione tanto en local como en producción.
  // En local: /admin/dashboard o /app/dashboard (el middleware no reescribe)
  // En prod: /dashboard (el middleware reescribe según el dominio)
  const isAdminHost = request.headers.get("host")?.startsWith("admin.");
  const isAppHost = request.headers.get("host")?.startsWith("app.");
  const isProd = isAdminHost || isAppHost;

  if (profile.role === "admin") {
    if (isProd) {
      const adminUrl =
        process.env.NEXT_PUBLIC_ADMIN_URL || origin;
      return NextResponse.redirect(`${adminUrl}/dashboard`);
    }
    return NextResponse.redirect(new URL("/admin/dashboard", origin));
  } else {
    if (isProd) {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || origin;
      return NextResponse.redirect(`${appUrl}/dashboard`);
    }
    return NextResponse.redirect(new URL("/app/dashboard", origin));
  }
}
