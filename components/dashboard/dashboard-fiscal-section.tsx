import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DashboardSheetError,
  expandCachedDashboard,
  getCompactDashboardData,
} from "@/lib/google-sheets/client";
import type {
  CachedDashboardData,
  RawDashboardData,
} from "@/lib/dashboard/aggregate";
import DashboardFiscalClient from "./dashboard-fiscal-client";

interface Props {
  companyId: string;
  companyName: string;
  periodId: string | undefined;
  bankAccount: string | undefined;
  view: string | undefined;
}

async function loadDashboardConfig(
  companyId: string
): Promise<{ sheet_id: string; sheet_gid: number | null; updated_at: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("dashboard")
    .from("client_dashboards")
    .select("sheet_id, sheet_gid, updated_at")
    .eq("company_id", companyId)
    .maybeSingle<{ sheet_id: string; sheet_gid: number | null; updated_at: string }>();
  return data ?? null;
}

function getCachedCompactData(
  sheetId: string,
  companyId: string
): Promise<CachedDashboardData> {
  return unstable_cache(
    async () => getCompactDashboardData(sheetId),
    // v6: pasa a formato columnar `CachedDashboardData` (string interning +
    // tuplas) para no rebasar el límite de 2 MiB de unstable_cache con sheets
    // grandes. Quita `description` del banco (no se consumía). Bumpear si
    // cambia el shape de CachedDashboardData.
    ["dashboard-raw-v6", companyId, sheetId],
    // El Sheet del equipo se actualiza 1x/día, cacheamos 24h. El admin puede
    // forzar refresh quitando+poniendo la config del Sheet si es urgente.
    { tags: [`dashboard:${companyId}`], revalidate: 86400 }
  )();
}

/**
 * Server component fino: resuelve config + datos crudos (cacheados 24 h) y
 * delega la interacción al client component, que filtra localmente al cambiar
 * trimestre/banco/vista.
 */
export default async function DashboardFiscalSection({
  companyId,
  companyName,
  periodId,
  bankAccount,
  view,
}: Props) {
  const config = await loadDashboardConfig(companyId);

  if (!config) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-10 shadow-sm flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-brand-teal/10 text-brand-teal flex items-center justify-center mb-4">
          <svg className="w-7 h-7 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5V21a.5.5 0 00.5.5h6V13.5H3zM10.5 21.5h10a.5.5 0 00.5-.5v-7.5h-10.5V21.5zM3 12h18V3.5a.5.5 0 00-.5-.5h-17a.5.5 0 00-.5.5V12z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-brand-navy">
          Estamos preparando tu dashboard fiscal
        </h2>
        <p className="mt-2 text-sm text-text-muted max-w-sm">
          Pronto aparecerá aquí.
        </p>
      </section>
    );
  }

  let raw: RawDashboardData;
  try {
    const cached = await getCachedCompactData(config.sheet_id, companyId);
    raw = expandCachedDashboard(cached);
  } catch (err) {
    const message =
      err instanceof DashboardSheetError
        ? err.message
        : "No se pudo cargar el dashboard. Avisa a tu asesor.";
    return (
      <section className="rounded-2xl border border-red-100 bg-red-50/50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-brand-navy">Dashboard</h2>
        <p className="mt-2 text-sm text-red-600">{message}</p>
      </section>
    );
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${config.sheet_id}/edit${
    config.sheet_gid != null ? `#gid=${config.sheet_gid}` : ""
  }`;

  return (
    <DashboardFiscalClient
      raw={raw}
      companyName={companyName}
      sheetUrl={sheetUrl}
      initialPeriodId={periodId}
      initialBankAccount={bankAccount}
      initialView={view}
      currentYear={new Date().getFullYear()}
    />
  );
}
