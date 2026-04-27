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
  const { searchParams, origin, pathname } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const rawNext = searchParams.get("next") ?? "/app/dashboard";

  // En dev (localhost) la ruta se sirve como /app/set-company y el middleware no
  // reescribe rutas. Si `next` viene sin prefijo de espacio, hay que añadir /app
  // para que el destino exista. En prod (host app.leanfinance.es) la ruta entra
  // como /set-company y el middleware reescribe el destino, así que se deja tal cual.
  const needsAppPrefix =
    pathname.startsWith("/app/") &&
    rawNext.startsWith("/") &&
    !rawNext.startsWith("/app/") &&
    !rawNext.startsWith("/admin/");
  const next = needsAppPrefix ? `/app${rawNext}` : rawNext;

  if (!companyId) {
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/app/login", origin));
  }

  // Verificar acceso y que la empresa no esté eliminada
  const { data: access } = await supabase
    .from("profile_companies")
    .select("company:companies(id, deleted_at)")
    .eq("profile_id", user.id)
    .eq("company_id", companyId)
    .single();

  const company = (access?.company ?? null) as { id: string; deleted_at: string | null } | null;
  if (!access || !company || company.deleted_at) {
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, COOKIE_OPTIONS);

  return NextResponse.redirect(new URL(next, origin));
}
