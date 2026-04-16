import { redirect } from "next/navigation";
import { getLinkPrefix } from "@/lib/link-prefix";

export default async function AppRootPage() {
  const prefix = await getLinkPrefix("app");
  redirect(`${prefix}/dashboard`);
}
