import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000/app";
const ADMIN_URL =
  process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000/admin";

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
    // Usuario sin perfil → no está dado de alta en el sistema
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  // Redirigir al espacio correcto según el rol
  if (profile.role === "admin") {
    return NextResponse.redirect(`${ADMIN_URL}/dashboard`);
  } else {
    return NextResponse.redirect(`${APP_URL}/dashboard`);
  }
}
