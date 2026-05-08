import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  aggregateDashboard,
  buildPeriodOptions,
  DashboardSheetError,
  getRawDashboardData,
  resolvePeriodFromId,
  type DashboardData,
  type PurchaseRow,
  type RawDashboardData,
  type SaleRow,
} from "@/lib/google-sheets/client";
import DashboardPeriodTabs from "./dashboard-period-tabs";
import DashboardDetailTable from "./dashboard-detail-table";
import DashboardColumnCard from "./dashboard-column-card";
import DashboardBankSelector from "./dashboard-bank-selector";
import DashboardViewTabs, { type DashboardView } from "./dashboard-view-tabs";

interface Props {
  companyId: string;
  companyName: string;
  periodId: string | undefined;
  bankAccount: string | undefined;
  view: string | undefined;
}

function resolveView(raw: string | undefined): DashboardView {
  if (raw === "compras" || raw === "bancos") return raw;
  return "ventas";
}

// Helpers de visibilidad por vista en móvil. En `md+` siempre `block` para
// recuperar el layout de 3 columnas.
function viewClass(active: DashboardView, target: DashboardView): string {
  return active === target ? "block" : "hidden md:block";
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

function getCachedRawData(sheetId: string, companyId: string) {
  return unstable_cache(
    async () => getRawDashboardData(sheetId),
    // v5: añade `documentNumber` en SaleDetail/PurchaseDetail y `description`
    // en RawBankRow. Bumpear si cambia el shape de RawDashboardData.
    ["dashboard-raw-v5", companyId, sheetId],
    // El Sheet del equipo se actualiza 1x/día, cacheamos 24h. El admin puede
    // forzar refresh quitando+poniendo la config del Sheet si es urgente.
    { tags: [`dashboard:${companyId}`], revalidate: 86400 }
  )();
}

export default async function DashboardFiscalSection({
  companyId,
  companyName,
  periodId,
  bankAccount,
  view,
}: Props) {
  const activeView = resolveView(view);
  const config = await loadDashboardConfig(companyId);

  if (!config) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-brand-navy">Dashboard fiscal</h2>
        <p className="mt-2 text-sm text-text-muted">
          Tu dashboard se está configurando. En breve aparecerá aquí. Si llevas más de 24 h sin
          verlo, contacta con tu asesor.
        </p>
      </section>
    );
  }

  let raw: RawDashboardData;
  try {
    raw = await getCachedRawData(config.sheet_id, companyId);
  } catch (err) {
    const message =
      err instanceof DashboardSheetError
        ? err.message
        : "No se pudo cargar el dashboard. Avisa a tu asesor.";
    return (
      <section className="rounded-2xl border border-red-100 bg-red-50/50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-brand-navy">Dashboard fiscal</h2>
        <p className="mt-2 text-sm text-red-600">{message}</p>
      </section>
    );
  }

  const currentYear = new Date().getFullYear();
  const periodOptions = buildPeriodOptions(currentYear);
  const filter = resolvePeriodFromId(periodId, currentYear);
  const data: DashboardData = aggregateDashboard(raw, filter, bankAccount ?? null);
  const activePeriodId =
    periodOptions.find((o) => JSON.stringify(o.filter) === JSON.stringify(filter))?.id ?? "year";

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${config.sheet_id}/edit${
    config.sheet_gid != null ? `#gid=${config.sheet_gid}` : ""
  }`;

  return (
    <section className="space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-brand-teal text-xs font-semibold uppercase tracking-wider mb-1">
            Dashboard
          </p>
          <div className="flex items-baseline gap-4 flex-wrap">
            <h2 className="text-3xl font-bold font-heading text-brand-navy tracking-tight truncate">
              {companyName}
            </h2>
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir el Google Sheet original"
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-brand-teal transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Ver Google Sheets original
            </a>
          </div>
        </div>
        <DashboardPeriodTabs options={periodOptions} activeId={activePeriodId} />
      </header>

      <DashboardViewTabs activeView={activeView} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={viewClass(activeView, "ventas")}>
          <DashboardColumnCard
            title="Ventas"
            accent="navy"
            kpiYear={data.sales.kpiYear}
            kpiMonth={data.sales.kpiMonth}
            monthly={data.sales.monthly}
          />
        </div>
        <div className={viewClass(activeView, "compras")}>
          <DashboardColumnCard
            title="Compras"
            accent="navy"
            kpiYear={data.purchases.kpiYear}
            kpiMonth={data.purchases.kpiMonth}
            monthly={data.purchases.monthly}
          />
        </div>
        <div className={viewClass(activeView, "bancos")}>
          <DashboardColumnCard
            title="Bancos"
            accent="teal"
            kpiYear={data.banks.kpiYear}
            kpiMonth={data.banks.kpiMonth}
            headerExtra={
              <DashboardBankSelector
                accounts={data.banks.accounts}
                selectedAccount={data.banks.selectedAccount}
              />
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={viewClass(activeView, "ventas")}>
          <PendingBox
            title={data.sales.pending.label}
            rows={[
              { label: "Subtotal", value: data.sales.pending.subtotal },
              { label: "Total", value: data.sales.pending.total },
              { label: "Cobrado", value: data.sales.pending.collected },
            ]}
          />
        </div>
        <div className={viewClass(activeView, "compras")}>
          <PendingBox
            title={data.purchases.pending.label}
            rows={[
              { label: "Subtotal", value: data.purchases.pending.subtotal },
              { label: "Total", value: data.purchases.pending.total },
              { label: "Pagado", value: data.purchases.pending.paid },
            ]}
          />
        </div>
        <div className={viewClass(activeView, "bancos")}>
          <PendingBox
            title={data.banks.pending.label}
            rows={[
              { label: "Importe", value: data.banks.pending.pending },
              { label: "Conciliado", value: data.banks.pending.reconciled },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className={viewClass(activeView, "ventas")}>
          <SalesTable rows={data.sales.rows} />
        </div>
        <div className={viewClass(activeView, "compras")}>
          <PurchasesTable rows={data.purchases.rows} />
        </div>
      </div>

      <p className="text-[11px] text-text-muted">
        Datos del Sheet del equipo de asesoría, agregados en nuestro servidor según el filtro seleccionado. Actualización diaria.
      </p>
    </section>
  );
}

function PendingBox({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-2">
        {title}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-[10px] text-text-muted">{r.label}</p>
            <p className="text-sm font-semibold text-brand-navy mt-0.5">{r.value || "—"}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function SalesTable({ rows }: { rows: SaleRow[] }) {
  return (
    <DashboardDetailTable
      title="Ventas — clientes pendientes/vencidos"
      headers={["Cliente", "Subtotal", "Total", "Cobrado", "Estado"]}
      rows={rows.map((r) => ({
        cells: [r.client, r.subtotal, r.total, r.collected, r.status],
        details: r.details.map((d) => ({
          date: d.date,
          documentNumber: d.documentNumber,
          cells: [d.subtotal, d.total, d.collected, d.status],
        })),
      }))}
    />
  );
}

function PurchasesTable({ rows }: { rows: PurchaseRow[] }) {
  return (
    <DashboardDetailTable
      title="Compras — proveedores pendientes/vencidos"
      headers={["Proveedor", "Subtotal", "Total", "Pagado", "Estado"]}
      rows={rows.map((r) => ({
        cells: [r.provider, r.subtotal, r.total, r.paid, r.status],
        details: r.details.map((d) => ({
          date: d.date,
          documentNumber: d.documentNumber,
          cells: [d.subtotal, d.total, d.paid, d.status],
        })),
      }))}
    />
  );
}
