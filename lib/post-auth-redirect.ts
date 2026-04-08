import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

/**
 * Shared post-auth redirect logic used by both /auth/callback and /auth/verify.
 * Checks profile, determines role, and redirects to the correct space.
 */
export async function handlePostAuthRedirect(
  request: NextRequest,
  supabase: SupabaseClient,
  user: { id: string },
  cookieStore: ReadonlyRequestCookies
): Promise<NextResponse> {
  const origin = new URL(request.url).origin;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    const response = NextResponse.redirect(new URL("/unauthorized", origin));
    deleteSbCookies(cookieStore, response);
    return response;
  }

  const isAdminHost = request.headers.get("host")?.startsWith("admin.");
  const isAppHost = request.headers.get("host")?.startsWith("app.");
  const isProd = isAdminHost || isAppHost;

  if (profile.role === "admin" || profile.role === "superadmin") {
    const adminPrefix = isProd ? "" : "/admin";
    const adminUrl = isProd
      ? process.env.NEXT_PUBLIC_ADMIN_URL || origin
      : origin;
    return NextResponse.redirect(new URL(`${adminPrefix}/dashboard`, adminUrl));
  }

  // Client: check associated companies
  const { data: profileCompanies } = await supabase
    .from("profile_companies")
    .select("company_id")
    .eq("profile_id", user.id);

  const companies = profileCompanies ?? [];

  if (companies.length === 0) {
    await supabase.auth.signOut();
    const response = NextResponse.redirect(
      new URL("/unauthorized", origin)
    );
    deleteSbCookies(cookieStore, response);
    return response;
  }

  const appPrefix = isProd ? "" : "/app";
  const appUrl = isProd
    ? process.env.NEXT_PUBLIC_APP_URL || origin
    : origin;

  if (companies.length === 1) {
    const { setActiveCompanyCookieOnResponse } = await import(
      "@/lib/active-company"
    );
    const response = NextResponse.redirect(
      new URL(`${appPrefix}/dashboard`, appUrl)
    );
    setActiveCompanyCookieOnResponse(response, companies[0].company_id);
    return response;
  }

  return NextResponse.redirect(
    new URL(`${appPrefix}/select-company`, appUrl)
  );
}

function deleteSbCookies(
  cookieStore: ReadonlyRequestCookies,
  response: NextResponse
) {
  cookieStore.getAll().forEach((cookie) => {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.delete(cookie.name);
    }
  });
}
