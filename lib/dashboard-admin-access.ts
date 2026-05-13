"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/require-permission";

const FISCAL_DEPARTMENT_SLUG = "asesoria-fiscal-y-contable";

// Cache a nivel de proceso. El id del dept fiscal es semilla y no cambia en
// runtime. No usamos unstable_cache porque el cliente Supabase server lee
// cookies y Next 15 prohíbe cookies() dentro de unstable_cache.
let cachedFiscalDeptId: string | null | undefined;

// Per-request dedupe: si una página llama 2-3 veces (canViewClientDashboard +
// canViewClientTaxModels + algún server action), las llamadas concurrentes
// comparten la misma promesa en vez de cada una resolverse aparte. La caché
// de proceso por encima salva las llamadas posteriores al primer request.
const getFiscalDeptIdInner = cache(async (): Promise<string | null> => {
  if (cachedFiscalDeptId !== undefined) return cachedFiscalDeptId;
  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("id")
    .eq("slug", FISCAL_DEPARTMENT_SLUG)
    .maybeSingle<{ id: string }>();
  cachedFiscalDeptId = data?.id ?? null;
  return cachedFiscalDeptId;
});

export async function getFiscalDepartmentId(): Promise<string | null> {
  return getFiscalDeptIdInner();
}

/**
 * Un admin puede ver el dashboard fiscal de un cliente si tiene acceso de
 * lectura al dpto Asesoría Fiscal y Contable. Usamos `read_dept_service`,
 * que comparten Miembro, Chief, Observador y Operador del departamento.
 *
 * `canViewClientTaxModels` usa exactamente el mismo permiso → con la
 * deduplicación per-request de `hasPermission` (ver lib/require-permission.ts)
 * el RPC se ejecuta UNA sola vez aunque se llame a ambas.
 */
export async function canViewClientDashboard(): Promise<boolean> {
  const fiscalDeptId = await getFiscalDepartmentId();
  if (!fiscalDeptId) return false;
  return hasPermission("read_dept_service", {
    type: "department",
    id: fiscalDeptId,
  });
}

/**
 * Un admin puede ver la vista de modelos fiscales de un cliente con los
 * mismos criterios que el dashboard: pertenencia al dpto fiscal vía
 * `read_dept_service`.
 */
export async function canViewClientTaxModels(): Promise<boolean> {
  const fiscalDeptId = await getFiscalDepartmentId();
  if (!fiscalDeptId) return false;
  return hasPermission("read_dept_service", {
    type: "department",
    id: fiscalDeptId,
  });
}
