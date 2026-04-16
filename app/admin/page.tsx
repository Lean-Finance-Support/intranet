import { redirect } from "next/navigation";
import { getLinkPrefix } from "@/lib/link-prefix";

export default async function AdminRootPage() {
  const prefix = await getLinkPrefix("admin");
  redirect(`${prefix}/dashboard`);
}
