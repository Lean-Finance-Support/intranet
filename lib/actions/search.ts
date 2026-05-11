import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import type { SearchableCompany } from "@/lib/search/types";

async function fetchSearchableCompanies(): Promise<SearchableCompany[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("companies")
    .select(
      "id, legal_name, company_name, deleted_at, company_services(is_active, service:services(slug))",
    )
    .is("deleted_at", null)
    .order("legal_name");
  if (error) {
    console.error("fetchSearchableCompanies failed", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const services = (row.company_services as Array<Record<string, unknown>> | null) ?? [];
    const activeSlugs = services
      .filter((cs) => cs.is_active)
      .map((cs) => (cs.service as { slug: string } | null)?.slug ?? null)
      .filter((s): s is string => s !== null);
    return {
      id: row.id as string,
      legal_name: row.legal_name as string,
      company_name: (row.company_name as string | null) ?? null,
      has_dashboard_service: activeSlugs.includes("dashboard"),
      has_tax_models_service: activeSlugs.includes("tax-models"),
    };
  });
}

const getCachedSearchableCompanies = unstable_cache(
  fetchSearchableCompanies,
  ["search:companies"],
  { tags: ["search:companies"], revalidate: 300 },
);

export async function getSearchableCompanies(): Promise<SearchableCompany[]> {
  await requireAdmin();
  return getCachedSearchableCompanies();
}
