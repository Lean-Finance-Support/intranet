import { cookies } from "next/headers";

export const ACTIVE_DEPARTMENT_COOKIE = "x-active-department-id";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 días
};

/** Lee el departamento activo desde la cookie (server components / server actions) */
export async function getActiveDepartmentId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_DEPARTMENT_COOKIE)?.value ?? null;
}

/** Setea la cookie de departamento activo en una respuesta NextResponse (route handlers) */
export function setActiveDepartmentCookieOnResponse(
  response: { cookies: { set: (name: string, value: string, opts: object) => void } },
  departmentId: string
) {
  response.cookies.set(ACTIVE_DEPARTMENT_COOKIE, departmentId, COOKIE_OPTIONS);
}

/** Setea la cookie directamente en el cookieStore (server actions) */
export async function setActiveDepartmentIdInCookies(departmentId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_DEPARTMENT_COOKIE, departmentId, COOKIE_OPTIONS);
}
