import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Esta ruta la usa el flujo GIS (signInWithIdToken).
// La sesión ya está establecida en el cliente; aquí solo verificamos
// el perfil y redirigimos al espacio correcto según el rol.

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000/app";
const ADMIN_URL =
  process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000/admin";

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
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  // Redirigir al espacio correcto según el rol
  if (profile.role === "admin") {
    return NextResponse.redirect(`${ADMIN_URL}/dashboard`);
  }

  return NextResponse.redirect(`${APP_URL}/dashboard`);
}
