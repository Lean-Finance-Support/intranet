import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // --- Detección del espacio ---
  const isAdminHost = host === "admin.leanfinance.es";
  const isAppHost = host === "app.leanfinance.es";
  const isProdDomain = isAdminHost || isAppHost;

  // Rutas que bypasean el middleware completamente
  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/renta/") ||
    pathname === "/unauthorized" ||
    pathname === "/select-company" ||
    pathname === "/app/select-company" ||
    pathname === "/select-department" ||
    pathname === "/admin/select-department"
  ) {
    if (isProdDomain && pathname === "/select-company") {
      return NextResponse.rewrite(new URL(`/app/select-company`, request.url));
    }
    if (isProdDomain && pathname === "/select-department") {
      return NextResponse.rewrite(new URL(`/admin/select-department`, request.url));
    }
    // /renta/* es público: si llega por admin.leanfinance.es lo redirigimos
    // al subdominio app, que es el que aparece en los emails.
    if (pathname.startsWith("/renta/") && isAdminHost) {
      const target = new URL(pathname + request.nextUrl.search, APP_URL);
      return NextResponse.redirect(target);
    }
    return NextResponse.next({ request });
  }

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

  const isOnLoginPage = isProdDomain
    ? pathname === "/login"
    : pathname === `/${space}/login`;

  // --- Sin sesión ---
  if (!user) {
    if (request.cookies.get("x-user-role")) {
      supabaseResponse.cookies.delete("x-user-role");
    }
    if (!isOnLoginPage) {
      return NextResponse.redirect(new URL(loginPath, request.url));
    }
    if (isProdDomain) {
      return NextResponse.rewrite(
        new URL(`/${space}${pathname}`, request.url)
      );
    }
    return supabaseResponse;
  }

  // --- Con sesión: comprobar perfil y rol ---
  const cachedRole = request.cookies.get("x-user-role")?.value;
  let role: string | null = cachedRole ?? null;

  if (!cachedRole) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
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

    supabaseResponse.cookies.set("x-user-role", role!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 604800, // 7 days
    });
  }

  const correctSpace = role === "admin" ? "admin" : "app";
  const homePath = correctSpace === "admin" ? "/inicio" : "/dashboard";

  // En login con sesión → redirigir al home del espacio correcto
  if (isOnLoginPage) {
    if (isProdDomain) {
      const correctOrigin = correctSpace === "admin" ? ADMIN_URL : APP_URL;
      return NextResponse.redirect(`${correctOrigin}${homePath}`);
    }
    return NextResponse.redirect(
      new URL(`/${correctSpace}${homePath}`, request.url)
    );
  }

  // Espacio incorrecto para el rol → redirigir
  if (space !== correctSpace) {
    if (isProdDomain) {
      const correctOrigin = correctSpace === "admin" ? ADMIN_URL : APP_URL;
      return NextResponse.redirect(`${correctOrigin}${homePath}`);
    }
    return NextResponse.redirect(
      new URL(`/${correctSpace}${homePath}`, request.url)
    );
  }

  // Todo OK → aplicar rewrite en producción
  if (isProdDomain) {
    const rewriteUrl = new URL(`/${space}${pathname}`, request.url);
    rewriteUrl.search = request.nextUrl.search;
    return NextResponse.rewrite(rewriteUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)"],
};
