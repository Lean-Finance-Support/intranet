import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // Rutas que bypasean el middleware completamente
  if (pathname.startsWith("/auth") || pathname === "/unauthorized") {
    return NextResponse.next({ request });
  }

  // --- Detección del espacio ---
  // En producción: por dominio. En local: por prefijo de ruta.
  const isAdminHost = host === "admin.leanfinance.es";
  const isAppHost = host === "app.leanfinance.es";
  const isProdDomain = isAdminHost || isAppHost;

  let space: "admin" | "app" = "app";
  if (isAdminHost || pathname.startsWith("/admin")) space = "admin";

  // --- Supabase client ---
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ruta de login efectiva según entorno
  const loginPath = isProdDomain ? "/login" : `/${space}/login`;

  // ¿Estamos en la página de login?
  const isOnLoginPage = isProdDomain
    ? pathname === "/login"
    : pathname === `/${space}/login`;

  // --- Sin sesión ---
  if (!user) {
    // Limpiar cookie de rol cacheado si no hay sesión
    if (request.cookies.get("x-user-role")) {
      supabaseResponse.cookies.delete("x-user-role");
    }
    if (!isOnLoginPage) {
      return NextResponse.redirect(new URL(loginPath, request.url));
    }
    // En login sin sesión: permitir con rewrite si es dominio de prod
    if (isProdDomain) {
      return NextResponse.rewrite(
        new URL(`/${space}${pathname}`, request.url)
      );
    }
    return supabaseResponse;
  }

  // --- Con sesión: comprobar perfil y rol ---
  // Usar cookie cacheada para evitar query a BD en cada request
  const cachedRole = request.cookies.get("x-user-role")?.value;
  let role: string | null = cachedRole ?? null;

  if (!cachedRole) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      // Sin perfil = no está dado de alta → desloguear y limpiar cookies de sesión
      await supabase.auth.signOut();
      const redirectResponse = NextResponse.redirect(
        new URL("/unauthorized", request.url)
      );
      request.cookies.getAll().forEach((cookie) => {
        if (cookie.name.startsWith("sb-")) {
          redirectResponse.cookies.delete(cookie.name);
        }
      });
      return redirectResponse;
    }

    role = profile.role;

    // Cachear el rol en cookie (httpOnly, 1 hora de vida)
    supabaseResponse.cookies.set("x-user-role", role!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 3600, // 1 hora
    });
  }

  const correctSpace = role === "admin" || role === "superadmin" ? "admin" : "app";

  // En login con sesión → redirigir al dashboard del espacio correcto
  if (isOnLoginPage) {
    if (isProdDomain) {
      const correctOrigin = correctSpace === "admin" ? ADMIN_URL : APP_URL;
      return NextResponse.redirect(`${correctOrigin}/dashboard`);
    }
    return NextResponse.redirect(
      new URL(`/${correctSpace}/dashboard`, request.url)
    );
  }

  // Espacio incorrecto para el rol → redirigir al espacio correcto
  if (space !== correctSpace) {
    if (isProdDomain) {
      const correctOrigin = correctSpace === "admin" ? ADMIN_URL : APP_URL;
      return NextResponse.redirect(`${correctOrigin}/dashboard`);
    }
    return NextResponse.redirect(
      new URL(`/${correctSpace}/dashboard`, request.url)
    );
  }

  // Todo OK → aplicar rewrite en producción para mapear / → /app/ o /admin/
  if (isProdDomain) {
    return NextResponse.rewrite(
      new URL(`/${space}${pathname}`, request.url)
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)"],
};
