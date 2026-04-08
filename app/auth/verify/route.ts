import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handlePostAuthRedirect } from "@/lib/post-auth-redirect";

// Esta ruta la usa el flujo GIS (signInWithIdToken).
// La sesión ya está establecida en el cliente; aquí solo verificamos
// el perfil y redirigimos al espacio correcto según el rol.

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

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

  return handlePostAuthRedirect(request, supabase, user, cookieStore);
}
