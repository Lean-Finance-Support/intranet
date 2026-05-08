"use server";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/require-permission";

const FISCAL_DEPARTMENT_SLUG = "asesoria-fiscal-y-contable";

// Cache a nivel de proceso. El id del dept fiscal es semilla y no cambia en
// runtime. No usamos unstable_cache porque el cliente Supabase server lee
// cookies y Next 15 prohíbe cookies() dentro de unstable_cache.
let cachedFiscalDeptId: string | null | undefined;

export async function getFiscalDepartmentId(): Promise<string | null> {
  if (cachedFiscalDeptId !== undefined) return cachedFiscalDeptId;
  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("id")
    .eq("slug", FISCAL_DEPARTMENT_SLUG)
    .maybeSingle<{ id: string }>();
  cachedFiscalDeptId = data?.id ?? null;
  return cachedFiscalDeptId;
}

/**
 * Un admin puede ver el dashboard fiscal de un cliente si tiene acceso de
 * lectura al dpto Asesoría Fiscal y Contable. Usamos `read_dept_service`,
 * que comparten Miembro, Chief, Observador y Operador del departamento.
 */
export async function canViewClientDashboard(): Promise<boolean> {
  const fiscalDeptId = await getFiscalDepartmentId();
  if (!fiscalDeptId) return false;
  return hasPermission("read_dept_service", {
    type: "department",
    id: fiscalDeptId,
  });
}
