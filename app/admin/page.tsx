import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function AdminRootPage() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isProd = host === "admin.leanfinance.es";

  redirect(isProd ? "/dashboard" : "/admin/dashboard");
}
