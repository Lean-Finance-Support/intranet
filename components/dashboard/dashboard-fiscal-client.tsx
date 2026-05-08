"use client";

import { useMemo, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  aggregateDashboard,
  buildPeriodOptions,
  resolvePeriodFromId,
  type DashboardData,
  type PurchaseRow,
  type RawDashboardData,
  type SaleRow,
} from "@/lib/dashboard/aggregate";
import DashboardPeriodTabs from "./dashboard-period-tabs";
import DashboardDetailTable from "./dashboard-detail-table";
import DashboardColumnCard from "./dashboard-column-card";
import DashboardBankSelector from "./dashboard-bank-selector";
import DashboardViewTabs, { type DashboardView } from "./dashboard-view-tabs";

interface Props {
  raw: RawDashboardData;
  companyName: string;
  sheetUrl: string;
  initialPeriodId: string | undefined;
  initialBankAccount: string | undefined;
  initialView: string | undefined;
  currentYear: number;
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

/**
 * Wrapper cliente: recibe los datos crudos del Sheet (cacheados en server) y
 * se encarga de toda la interacción (cambio de trimestre, banco, vista en
 * móvil) recomputando localmente con `useMemo`. El cambio se refleja en la URL
 * con `router.replace` sin scroll para que sea bookmarkable y compartible,
 * pero sin pegar de nuevo al servidor.
 */
export default function DashboardFiscalClient({
  raw,
  companyName,
  sheetUrl,
  initialPeriodId,
  initialBankAccount,
  initialView,
  currentYear,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [periodId, setPeriodId] = useState<string>(initialPeriodId ?? "year");
  const [bankAccount, setBankAccount] = useState<string | null>(
    initialBankAccount ?? null
  );
  const [view, setView] = useState<DashboardView>(resolveView(initialView));

  const periodOptions = useMemo(() => buildPeriodOptions(currentYear), [currentYear]);

  const data: DashboardData = useMemo(() => {
    const filter = resolvePeriodFromId(periodId, currentYear);
    return aggregateDashboard(raw, filter, bankAccount);
  }, [raw, periodId, bankAccount, currentYear]);

  // Refleja el state actual en la URL (sin recargar) para que la vista sea
  // bookmarkable y compartible. `replace` para no llenar el history stack;
  // `scroll: false` para no saltar al top en cada click.
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (periodId === "year") params.delete("period");
    else params.set("period", periodId);
    if (!bankAccount) params.delete("bank");
    else params.set("bank", bankAccount);
    if (view === "ventas") params.delete("view");
    else params.set("view", view);
    const qs = params.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    // Solo actualiza si la URL cambia respecto a la actual.
    const current = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
    if (target !== current) {
      router.replace(target, { scroll: false });
    }
    // No incluimos `searchParams` en las deps para evitar loops cuando el
    // router actualiza el snapshot tras nuestro propio replace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId, bankAccount, view, pathname, router]);

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
        <DashboardPeriodTabs
          options={periodOptions}
          activeId={periodId}
          onChange={setPeriodId}
        />
      </header>

      <DashboardViewTabs activeView={view} onChange={setView} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={viewClass(view, "ventas")}>
          <DashboardColumnCard
            title="Ventas"
            accent="navy"
            kpiYear={data.sales.kpiYear}
            kpiMonth={data.sales.kpiMonth}
            monthly={data.sales.monthly}
          />
        </div>
        <div className={viewClass(view, "compras")}>
          <DashboardColumnCard
            title="Compras"
            accent="navy"
            kpiYear={data.purchases.kpiYear}
            kpiMonth={data.purchases.kpiMonth}
            monthly={data.purchases.monthly}
          />
        </div>
        <div className={viewClass(view, "bancos")}>
          <DashboardColumnCard
            title="Bancos"
            accent="teal"
            kpiYear={data.banks.kpiYear}
            kpiMonth={data.banks.kpiMonth}
            headerExtra={
              <DashboardBankSelector
                accounts={data.banks.accounts}
                selectedAccount={data.banks.selectedAccount}
                onChange={setBankAccount}
              />
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={viewClass(view, "ventas")}>
          <PendingBox
            title={data.sales.pending.label}
            rows={[
              { label: "Subtotal", value: data.sales.pending.subtotal },
              { label: "Total", value: data.sales.pending.total },
              { label: "Cobrado", value: data.sales.pending.collected },
            ]}
          />
        </div>
        <div className={viewClass(view, "compras")}>
          <PendingBox
            title={data.purchases.pending.label}
            rows={[
              { label: "Subtotal", value: data.purchases.pending.subtotal },
              { label: "Total", value: data.purchases.pending.total },
              { label: "Pagado", value: data.purchases.pending.paid },
            ]}
          />
        </div>
        <div className={viewClass(view, "bancos")}>
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
        <div className={viewClass(view, "ventas")}>
          <SalesTable rows={data.sales.rows} />
        </div>
        <div className={viewClass(view, "compras")}>
          <PurchasesTable rows={data.purchases.rows} />
        </div>
      </div>

      <p className="text-[11px] text-text-muted">
        Datos del Sheet del equipo de asesoría, cargados al abrir la vista y filtrados localmente al cambiar de trimestre. Actualización diaria.
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
