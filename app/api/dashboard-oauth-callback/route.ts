import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getOAuth2Client } from "@/lib/google-sheets/client";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/dashboard-oauth-setup?error=${encodeURIComponent(error)}`, req.url)
    );
  }
  if (!code) {
    return NextResponse.redirect(
      new URL(`/admin/dashboard-oauth-setup?error=missing_code`, req.url)
    );
  }

  const redirectUri = `${url.protocol}//${url.host}/api/dashboard-oauth-callback`;

  try {
    const oauth = getOAuth2Client();
    const { tokens } = await oauth.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(
          "/admin/dashboard-oauth-setup?error=no_refresh_token_returned",
          req.url
        )
      );
    }
    return NextResponse.redirect(
      new URL(
        `/admin/dashboard-oauth-setup?refresh_token=${encodeURIComponent(tokens.refresh_token)}`,
        req.url
      )
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "exchange_failed";
    return NextResponse.redirect(
      new URL(`/admin/dashboard-oauth-setup?error=${encodeURIComponent(msg)}`, req.url)
    );
  }
}
