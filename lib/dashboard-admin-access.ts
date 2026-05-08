"use server";

import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/require-permission";

const FISCAL_DEPARTMENT_SLUG = "asesoria-fiscal-y-contable";

/**
 * Devuelve el id del departamento "Asesoría Fiscal y Contable".
 * Cacheado indefinidamente (es semilla, no cambia en runtime).
 */
const getFiscalDepartmentIdCached = unstable_cache(
  async (): Promise<string | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("departments")
      .select("id")
      .eq("slug", FISCAL_DEPARTMENT_SLUG)
      .maybeSingle<{ id: string }>();
    return data?.id ?? null;
  },
  ["fiscal-department-id-v1"],
  { revalidate: 3600 }
);

export async function getFiscalDepartmentId(): Promise<string | null> {
  return getFiscalDepartmentIdCached();
}

/**
 * Un admin puede ver el dashboard fiscal de un cliente si pertenece al
 * departamento Asesoría Fiscal y Contable (rol "Miembro de departamento" o
 * "Chief", ambos conceden `member_of_department` con scope `department`).
 */
export async function canViewClientDashboard(): Promise<boolean> {
  const fiscalDeptId = await getFiscalDepartmentId();
  if (!fiscalDeptId) return false;
  return hasPermission("member_of_department", {
    type: "department",
    id: fiscalDeptId,
  });
}
