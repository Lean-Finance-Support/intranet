import { redirect } from "next/navigation";
import { getLinkPrefix } from "@/lib/link-prefix";
import { getOnboardingData } from "../actions";
import ImportarProposal from "./_components/importar-proposal";

export default async function ImportarProposalPage() {
  const [data, linkPrefix] = await Promise.all([
    getOnboardingData(),
    getLinkPrefix("admin"),
  ]);

  if (!data.canCreate || !data.canManageClientAccounts || !data.canRequestDocumentation) {
    redirect(`${linkPrefix}/clientes`);
  }

  return <ImportarProposal data={data} linkPrefix={linkPrefix} />;
}
