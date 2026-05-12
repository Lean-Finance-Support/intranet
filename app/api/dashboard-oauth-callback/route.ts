import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getOAuth2Client } from "@/lib/google-sheets/client";

const STATE_COOKIE = "dashboard_oauth_state";
const TOKEN_COOKIE = "dashboard_oauth_token";

function buildSetupRedirect(req: NextRequest, error?: string): NextResponse {
  const target = error
    ? new URL(`/admin/dashboard-oauth-setup?error=${encodeURIComponent(error)}`, req.url)
    : new URL(`/admin/dashboard-oauth-setup`, req.url);
  const res = NextResponse.redirect(target);
  // No queremos que el refresh_token (o el state) acaben en caches o se
  // filtren vía Referer si el usuario hace click en algún enlace externo.
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const stateFromQuery = url.searchParams.get("state");

  // Defensa CSRF: el state generado por startOAuthFlow se guardó en cookie
  // httpOnly. Aquí lo leemos y lo comparamos con el `state` que devuelve
  // Google. Si no coinciden (o falta alguno) abortamos antes incluso de mirar
  // el `code` — así un atacante no puede inducir al admin a canjear un code
  // ajeno (refresh_token poisoning).
  const cookieStore = await cookies();
  const stateFromCookie = cookieStore.get(STATE_COOKIE)?.value ?? null;
  cookieStore.delete(STATE_COOKIE);

  if (!stateFromCookie || !stateFromQuery || stateFromCookie !== stateFromQuery) {
    return buildSetupRedirect(req, "invalid_state");
  }

  if (error) {
    return buildSetupRedirect(req, error);
  }
  if (!code) {
    return buildSetupRedirect(req, "missing_code");
  }

  const redirectUri = `${url.protocol}//${url.host}/api/dashboard-oauth-callback`;

  try {
    const oauth = getOAuth2Client();
    const { tokens } = await oauth.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.refresh_token) {
      return buildSetupRedirect(req, "no_refresh_token_returned");
    }

    // Guarda el refresh_token en una cookie httpOnly single-use (TTL 60 s).
    // La setup page la lee y la muestra una vez; tras 60 s expira sola.
    // NO ponemos el token en la URL para que no aparezca en logs, history ni
    // Referer si el usuario navega fuera.
    cookieStore.set(TOKEN_COOKIE, tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/admin/dashboard-oauth-setup",
      maxAge: 60,
    });
    return buildSetupRedirect(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "exchange_failed";
    return buildSetupRedirect(req, msg);
  }
}
