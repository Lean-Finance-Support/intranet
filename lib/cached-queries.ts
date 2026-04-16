import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// ============================================================
// LAYER 1: Per-request dedup (React cache)
// Deduplicates getUser() within a single render pass.
// Layout + page + notifications all share one getUser() call.
// ============================================================

export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

// ============================================================
// LAYER 2: Cross-request cache (unstable_cache)
// Uses admin client (service role) since cached functions
// cannot access per-request cookies.
// Auth is always verified via getAuthUser() before calling these.
// ============================================================

/** Profile data: role, full_name, email. Cached 5 min per user. */
export async function getCachedProfile(userId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("profiles")
        .select("role, full_name, email")
        .eq("id", userId)
        .single();
      return data;
    },
    ["profile", userId],
    { tags: [`profile:${userId}`], revalidate: 300 }
  )();
}

/**
 * Departments where the user has the `member_of_department` permission
 * (incluyendo los que le llegan vía el rol Chief).
 * Cached 5 min.
 */
export async function getCachedUserDepartments(userId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data: scopeRows } = await admin.rpc("user_scope_ids", {
        uid: userId,
        perm: "member_of_department",
        p_scope_type: "department",
      });
      const deptIds = (scopeRows ?? [])
        .map((r: { scope_id: string }) => r.scope_id)
        .filter(Boolean);
      if (deptIds.length === 0) return [];
      const { data } = await admin
        .from("departments")
        .select("id, name, slug")
        .in("id", deptIds);
      return (data ?? []) as { id: string; name: string; slug: string }[];
    },
    ["user-departments", userId],
    { tags: [`user-departments:${userId}`], revalidate: 300 }
  )();
}

/** Companies linked to a client user. Cached 5 min. Excluye soft-deleted. */
export async function getCachedUserCompanies(userId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("profile_companies")
        .select("company:companies(id, legal_name, company_name, deleted_at)")
        .eq("profile_id", userId);
      return (data ?? [])
        .map((row: Record<string, unknown>) => {
          const c = row.company as {
            id: string;
            legal_name: string;
            company_name: string | null;
            deleted_at: string | null;
          } | null;
          if (!c || c.deleted_at) return null;
          return { id: c.id, legal_name: c.legal_name, company_name: c.company_name };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
    },
    ["user-companies", userId],
    { tags: [`user-companies:${userId}`], revalidate: 300 }
  )();
}

/** Service slugs active for a set of departments. Cached 10 min. */
export async function getCachedDepartmentServiceSlugs(deptIds: string[]) {
  if (deptIds.length === 0) return [];
  const key = [...deptIds].sort().join(",");
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("department_services")
        .select("service:services(slug)")
        .in("department_id", deptIds)
        .eq("is_active", true);
      return (data ?? [])
        .map((ds: Record<string, unknown>) => {
          const svc = ds.service as { slug: string } | null;
          return svc?.slug ?? null;
        })
        .filter((s): s is string => s !== null);
    },
    ["dept-service-slugs", key],
    { tags: deptIds.map((id) => `dept-services:${id}`), revalidate: 600 }
  )();
}

/** Service slugs active for a company. Cached 10 min. */
export async function getCachedCompanyServiceSlugs(companyId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("company_services")
        .select("is_active, service:services(slug)")
        .eq("company_id", companyId);
      return (data ?? [])
        .filter((cs: Record<string, unknown>) => cs.is_active)
        .map((cs: Record<string, unknown>) => {
          const svc = cs.service as { slug: string } | null;
          return svc?.slug ?? null;
        })
        .filter((s): s is string => s !== null);
    },
    ["company-service-slugs", companyId],
    { tags: [`company-services:${companyId}`], revalidate: 600 }
  )();
}
