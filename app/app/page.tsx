import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function AppRootPage() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "app.leanfinance.es";

  redirect(isProd ? "/dashboard" : "/app/dashboard");
}
