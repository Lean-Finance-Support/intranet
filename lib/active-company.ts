import { cache } from "react";
import { cookies } from "next/headers";

export const ACTIVE_COMPANY_COOKIE = "x-active-company-id";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 días
};

/** Lee la empresa activa desde la cookie (server components / server actions).
 *  Dedup per-request via React cache(). */
export const getActiveCompanyId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
});

/** Setea la cookie de empresa activa en una respuesta NextResponse (route handlers) */
export function setActiveCompanyCookieOnResponse(
  response: { cookies: { set: (name: string, value: string, opts: object) => void } },
  companyId: string
) {
  response.cookies.set(ACTIVE_COMPANY_COOKIE, companyId, COOKIE_OPTIONS);
}

/** Setea la cookie directamente en el cookieStore (server actions) */
export async function setActiveCompanyIdInCookies(companyId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, COOKIE_OPTIONS);
}
