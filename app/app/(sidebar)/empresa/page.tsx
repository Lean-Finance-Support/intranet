import { getAuthUser } from "@/lib/cached-queries";
import EmpresaPage from "@/components/empresa-page";

export default async function AppEmpresaPage() {
  const { user } = await getAuthUser();
  return <EmpresaPage currentUserId={user?.id ?? ""} />;
}
