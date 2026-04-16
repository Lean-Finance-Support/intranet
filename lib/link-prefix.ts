import { cache } from "react";
import { headers } from "next/headers";

type Space = "app" | "admin";

const PROD_HOSTS: Record<Space, string> = {
  app: "app.leanfinance.es",
  admin: "admin.leanfinance.es",
};

/** Devuelve `""` en producción (host canónico) y `/app` o `/admin` en dev.
 *  Dedup per-request via React cache(). */
export const getLinkPrefix = cache(async (space: Space): Promise<string> => {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  return host === PROD_HOSTS[space] ? "" : `/${space}`;
});
