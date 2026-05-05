import { redirect } from "next/navigation";
import { getLinkPrefix } from "@/lib/link-prefix";
import { getOnboardingData } from "./actions";
import OnboardingWizard from "./_components/onboarding-wizard";

export default async function OnboardingPage() {
  const [data, linkPrefix] = await Promise.all([
    getOnboardingData(),
    getLinkPrefix("admin"),
  ]);

  if (!data.canCreate || !data.canManageClientAccounts || !data.canRequestDocumentation) {
    redirect(`${linkPrefix}/clientes`);
  }

  return <OnboardingWizard data={data} linkPrefix={linkPrefix} />;
}
