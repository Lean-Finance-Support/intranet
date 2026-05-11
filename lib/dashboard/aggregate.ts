// Agregación pura del dashboard. Aislada del fetch a Google Sheets para que
// pueda importarse desde componentes cliente sin arrastrar `googleapis`. El
// fetch (server-only) vive en `lib/google-sheets/client.ts`.

import { formatEur } from "@/lib/format";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type PeriodFilter =
  | { kind: "year"; year: number }
  | { kind: "quarter"; year: number; quarter: 1 | 2 | 3 | 4 }
  | { kind: "last_month"; year: number };

export interface PeriodOption {
  id: string;
  label: string;
  filter: PeriodFilter;
}

export type KpiCard = {
  label: string;
  period: string;
  value: string;
  isNegative: boolean;
};

export type SalesTotals = {
  label: string;
  subtotal: string;
  total: string;
  collected: string;
};

export type PurchaseTotals = {
  label: string;
  subtotal: string;
  total: string;
  paid: string;
};

export type BankPendingTotals = {
  label: string;
  pending: string;
  reconciled: string;
};

export type SaleDetail = {
  date: string;
  documentNumber: string;
  subtotal: string;
  total: string;
  collected: string;
  status: string;
};

export type PurchaseDetail = {
  date: string;
  documentNumber: string;
  subtotal: string;
  total: string;
  paid: string;
  status: string;
};

export type SaleRow = {
  client: string;
  subtotal: string;
  total: string;
  collected: string;
  status: string;
  details: SaleDetail[];
};

export type PurchaseRow = {
  provider: string;
  subtotal: string;
  total: string;
  paid: string;
  status: string;
  details: PurchaseDetail[];
};

export type MonthlyPoint = {
  monthKey: string;
  label: string;
  value: number;
};

export type DashboardData = {
  sales: {
    kpiYear: KpiCard;
    kpiMonth: KpiCard;
    pending: SalesTotals;
    rows: SaleRow[];
    monthly: MonthlyPoint[];
  };
  purchases: {
    kpiYear: KpiCard;
    kpiMonth: KpiCard;
    pending: PurchaseTotals;
    rows: PurchaseRow[];
    monthly: MonthlyPoint[];
  };
  banks: {
    kpiYear: KpiCard;
    kpiMonth: KpiCard;
    pending: BankPendingTotals;
    accounts: string[];
    selectedAccount: string | null;
  };
};

export interface RawSaleRow {
  date: string;
  client: string;
  documentNumber: string;
  subtotal: number;
  total: number;
  collected: number;
  status: string;
}
export interface RawPurchaseRow {
  date: string;
  provider: string;
  documentNumber: string;
  subtotal: number;
  total: number;
  paid: number;
  status: string;
}
export interface RawBankRow {
  date: string;
  amount: number;
  reconciled: number;
  status: string;
  account: string;
}

export interface RawDashboardData {
  sales: RawSaleRow[];
  purchases: RawPurchaseRow[];
  banks: RawBankRow[];
  fetchedAt: string;
  yearsAvailable: number[];
  bankAccounts: string[];
}

// ---------------------------------------------------------------------------
// Formato compacto para `unstable_cache`
// ---------------------------------------------------------------------------
//
// Next.js limita las entradas de `unstable_cache` a 2 MiB. Sheets grandes
// pueden generar payloads `RawDashboardData` por encima de ese límite cuando
// se serializan a JSON (los nombres de cliente/proveedor se repiten miles de
// veces y cada fila lleva 7+ keys verbosas). Cacheamos un formato columnar:
// arrays paralelos de campos primitivos + diccionario de strings deduplicado
// (clientes, proveedores, cuentas, estados). En memoria se vuelve a expandir
// a `RawDashboardData` antes de pasarlo a la agregación, así el resto del
// pipeline no se entera.
//
// Reducción típica: ~3-4x menos bytes que el JSON de `RawDashboardData`.

export interface CachedDashboardData {
  v: 1;
  // Diccionario único de strings — cada fila referencia por índice.
  strings: string[];
  // Cada fila se serializa como tupla posicional. Los strings se reemplazan
  // por su índice en `strings`. Los números se preservan.
  // sales: [dateIdx, clientIdx, docIdx, subtotal, total, collected, statusIdx]
  sales: Array<[number, number, number, number, number, number, number]>;
  // purchases: [dateIdx, providerIdx, docIdx, subtotal, total, paid, statusIdx]
  purchases: Array<[number, number, number, number, number, number, number]>;
  // banks: [dateIdx, amount, reconciled, statusIdx, accountIdx]
  banks: Array<[number, number, number, number, number]>;
  fetchedAt: string;
  yearsAvailable: number[];
  bankAccounts: string[];
}

class StringInterner {
  private readonly map = new Map<string, number>();
  readonly list: string[] = [];
  intern(s: string): number {
    const existing = this.map.get(s);
    if (existing !== undefined) return existing;
    const idx = this.list.length;
    this.list.push(s);
    this.map.set(s, idx);
    return idx;
  }
}

export function compactRawDashboard(raw: RawDashboardData): CachedDashboardData {
  const interner = new StringInterner();
  const sales = raw.sales.map(
    (s) =>
      [
        interner.intern(s.date),
        interner.intern(s.client),
        interner.intern(s.documentNumber),
        s.subtotal,
        s.total,
        s.collected,
        interner.intern(s.status),
      ] as [number, number, number, number, number, number, number]
  );
  const purchases = raw.purchases.map(
    (p) =>
      [
        interner.intern(p.date),
        interner.intern(p.provider),
        interner.intern(p.documentNumber),
        p.subtotal,
        p.total,
        p.paid,
        interner.intern(p.status),
      ] as [number, number, number, number, number, number, number]
  );
  const banks = raw.banks.map(
    (b) =>
      [
        interner.intern(b.date),
        b.amount,
        b.reconciled,
        interner.intern(b.status),
        interner.intern(b.account),
      ] as [number, number, number, number, number]
  );
  return {
    v: 1,
    strings: interner.list,
    sales,
    purchases,
    banks,
    fetchedAt: raw.fetchedAt,
    yearsAvailable: raw.yearsAvailable,
    bankAccounts: raw.bankAccounts,
  };
}

export function expandCachedDashboard(cached: CachedDashboardData): RawDashboardData {
  const s = cached.strings;
  const sales: RawSaleRow[] = cached.sales.map((r) => ({
    date: s[r[0]],
    client: s[r[1]],
    documentNumber: s[r[2]],
    subtotal: r[3],
    total: r[4],
    collected: r[5],
    status: s[r[6]],
  }));
  const purchases: RawPurchaseRow[] = cached.purchases.map((r) => ({
    date: s[r[0]],
    provider: s[r[1]],
    documentNumber: s[r[2]],
    subtotal: r[3],
    total: r[4],
    paid: r[5],
    status: s[r[6]],
  }));
  const banks: RawBankRow[] = cached.banks.map((r) => ({
    date: s[r[0]],
    amount: r[1],
    reconciled: r[2],
    status: s[r[3]],
    account: s[r[4]],
  }));
  return {
    sales,
    purchases,
    banks,
    fetchedAt: cached.fetchedAt,
    yearsAvailable: cached.yearsAvailable,
    bankAccounts: cached.bankAccounts,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMoney(n: number): string {
  return formatEur(n);
}

function fmtDateDmy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

const MONTH_NAMES_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatPeriodLabel(filter: PeriodFilter): string {
  if (filter.kind === "year") return String(filter.year);
  if (filter.kind === "quarter") return `Q${filter.quarter} ${filter.year}`;
  return `Último mes ${filter.year}`;
}

function formatMonthLabel(year: number, monthIdx0: number): string {
  return `${MONTH_NAMES_ES[monthIdx0]} ${String(year).slice(-2)}`;
}

// ---------------------------------------------------------------------------
// Filtros + agregación
// ---------------------------------------------------------------------------

function periodRange(filter: PeriodFilter): { from: string; to: string } {
  if (filter.kind === "year") {
    return { from: `${filter.year}-01-01`, to: `${filter.year}-12-31` };
  }
  if (filter.kind === "quarter") {
    const startMonth = (filter.quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const lastDay = new Date(filter.year, endMonth, 0).getDate();
    return {
      from: `${filter.year}-${String(startMonth).padStart(2, "0")}-01`,
      to: `${filter.year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  return { from: `${filter.year}-01-01`, to: `${filter.year}-12-31` };
}

function withinRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function lastMonthWithData(dates: string[], year: number): { month: number; from: string; to: string } | null {
  let latest: string | null = null;
  for (const d of dates) {
    if (d.slice(0, 4) !== String(year)) continue;
    if (!latest || d > latest) latest = d;
  }
  if (!latest) return null;
  const month = Number(latest.slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate();
  return {
    month,
    from: `${year}-${String(month).padStart(2, "0")}-01`,
    to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

const PENDING_STATUSES_SALES = new Set(["pendiente", "vencido"]);
const PENDING_STATUSES_PURCHASES = new Set(["pendiente", "vencido"]);

function isPendingSale(s: RawSaleRow): boolean {
  return PENDING_STATUSES_SALES.has(s.status.toLowerCase());
}
function isPendingPurchase(p: RawPurchaseRow): boolean {
  return PENDING_STATUSES_PURCHASES.has(p.status.toLowerCase());
}
function isReconciled(b: RawBankRow): boolean {
  return b.status.toLowerCase() === "conciliado";
}

function monthsInRange(filter: PeriodFilter): { key: string; label: string; from: string; to: string }[] {
  const out: { key: string; label: string; from: string; to: string }[] = [];
  let startMonth = 1;
  let endMonth = 12;
  if (filter.kind === "quarter") {
    startMonth = (filter.quarter - 1) * 3 + 1;
    endMonth = startMonth + 2;
  }
  for (let m = startMonth; m <= endMonth; m++) {
    const lastDay = new Date(filter.year, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    out.push({
      key: `${filter.year}-${mm}`,
      label: formatMonthLabel(filter.year, m - 1),
      from: `${filter.year}-${mm}-01`,
      to: `${filter.year}-${mm}-${String(lastDay).padStart(2, "0")}`,
    });
  }
  return out;
}

export function aggregateDashboard(
  raw: RawDashboardData,
  filter: PeriodFilter,
  bankAccount?: string | null
): DashboardData {
  const { from, to } = periodRange(filter);
  const monthlyBuckets = monthsInRange(filter);
  const accounts = raw.bankAccounts ?? [];
  const selectedAccount = bankAccount && accounts.includes(bankAccount) ? bankAccount : null;

  // VENTAS — el "Total facturado" del template del equipo suma el SUBTOTAL Línea
  // (sin IVA), no el Total Línea. Replicamos eso para coincidir con el GS.
  const salesPeriod = raw.sales.filter((s) => withinRange(s.date, from, to));
  const salesTotalYear = salesPeriod.reduce((acc, s) => acc + s.subtotal, 0);

  const salesAllDates = salesPeriod.map((s) => s.date);
  const salesLastMonth = lastMonthWithData(salesAllDates, filter.year);
  const salesMonthRows = salesLastMonth
    ? salesPeriod.filter((s) => withinRange(s.date, salesLastMonth.from, salesLastMonth.to))
    : [];
  const salesTotalMonth = salesMonthRows.reduce((acc, s) => acc + s.subtotal, 0);

  const salesMonthly: MonthlyPoint[] = monthlyBuckets.map((b) => ({
    monthKey: b.key,
    label: b.label,
    value: salesPeriod
      .filter((s) => withinRange(s.date, b.from, b.to))
      .reduce((acc, s) => acc + s.subtotal, 0),
  }));

  const salesPending = salesPeriod.filter(isPendingSale);
  const salesPendingSubtotal = salesPending.reduce((acc, s) => acc + s.subtotal, 0);
  const salesPendingTotal = salesPending.reduce((acc, s) => acc + s.total, 0);
  const salesPendingCollected = salesPending.reduce((acc, s) => acc + s.collected, 0);

  const salesByClient = new Map<
    string,
    { subtotal: number; total: number; collected: number; status: string; raws: RawSaleRow[] }
  >();
  for (const s of salesPending) {
    const existing = salesByClient.get(s.client);
    if (existing) {
      existing.subtotal += s.subtotal;
      existing.total += s.total;
      existing.collected += s.collected;
      if (s.status.toLowerCase() === "vencido") existing.status = "Vencido";
      existing.raws.push(s);
    } else {
      salesByClient.set(s.client, {
        subtotal: s.subtotal,
        total: s.total,
        collected: s.collected,
        status: s.status || "Pendiente",
        raws: [s],
      });
    }
  }
  const salesRows: SaleRow[] = Array.from(salesByClient.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([client, v]) => ({
      client,
      subtotal: fmtMoney(v.subtotal),
      total: fmtMoney(v.total),
      collected: fmtMoney(v.collected),
      status: v.status,
      details: v.raws
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .map((r) => ({
          date: fmtDateDmy(r.date),
          documentNumber: r.documentNumber,
          subtotal: fmtMoney(r.subtotal),
          total: fmtMoney(r.total),
          collected: fmtMoney(r.collected),
          status: r.status || "Pendiente",
        })),
    }));

  // COMPRAS
  const purchasesPeriod = raw.purchases.filter((p) => withinRange(p.date, from, to));
  const purchasesTotalYear = purchasesPeriod.reduce((acc, p) => acc + p.total, 0);

  const purchasesAllDates = purchasesPeriod.map((p) => p.date);
  const purchasesLastMonth = lastMonthWithData(purchasesAllDates, filter.year);
  const purchasesMonthRows = purchasesLastMonth
    ? purchasesPeriod.filter((p) => withinRange(p.date, purchasesLastMonth.from, purchasesLastMonth.to))
    : [];
  const purchasesTotalMonth = purchasesMonthRows.reduce((acc, p) => acc + p.total, 0);

  const purchasesMonthly: MonthlyPoint[] = monthlyBuckets.map((b) => ({
    monthKey: b.key,
    label: b.label,
    value: purchasesPeriod
      .filter((p) => withinRange(p.date, b.from, b.to))
      .reduce((acc, p) => acc + p.subtotal, 0),
  }));

  const purchasesPending = purchasesPeriod.filter(isPendingPurchase);
  const purchasesPendingSubtotal = purchasesPending.reduce((acc, p) => acc + p.subtotal, 0);
  const purchasesPendingTotal = purchasesPending.reduce((acc, p) => acc + p.total, 0);
  const purchasesPendingPaid = purchasesPending.reduce((acc, p) => acc + p.paid, 0);

  const purchasesByProvider = new Map<
    string,
    { subtotal: number; total: number; paid: number; status: string; raws: RawPurchaseRow[] }
  >();
  for (const p of purchasesPending) {
    const existing = purchasesByProvider.get(p.provider);
    if (existing) {
      existing.subtotal += p.subtotal;
      existing.total += p.total;
      existing.paid += p.paid;
      if (p.status.toLowerCase() === "vencido") existing.status = "Vencido";
      existing.raws.push(p);
    } else {
      purchasesByProvider.set(p.provider, {
        subtotal: p.subtotal,
        total: p.total,
        paid: p.paid,
        status: p.status || "Pendiente",
        raws: [p],
      });
    }
  }
  const purchasesRows: PurchaseRow[] = Array.from(purchasesByProvider.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([provider, v]) => ({
      provider,
      subtotal: fmtMoney(v.subtotal),
      total: fmtMoney(v.total),
      paid: fmtMoney(v.paid),
      status: v.status,
      details: v.raws
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .map((r) => ({
          date: fmtDateDmy(r.date),
          documentNumber: r.documentNumber,
          subtotal: fmtMoney(r.subtotal),
          total: fmtMoney(r.total),
          paid: fmtMoney(r.paid),
          status: r.status || "Pendiente",
        })),
    }));

  // BANCOS
  const banksPeriod = raw.banks
    .filter((b) => withinRange(b.date, from, to))
    .filter((b) => !selectedAccount || b.account === selectedAccount);
  const banksCashflowYear = banksPeriod.reduce((acc, b) => acc + b.amount, 0);

  const banksAllDates = banksPeriod.map((b) => b.date);
  const banksLastMonth = lastMonthWithData(banksAllDates, filter.year);
  const banksMonthRows = banksLastMonth
    ? banksPeriod.filter((b) => withinRange(b.date, banksLastMonth.from, banksLastMonth.to))
    : [];
  const banksCashflowMonth = banksMonthRows.reduce((acc, b) => acc + b.amount, 0);

  const banksPending = banksPeriod.filter((b) => !isReconciled(b));
  const banksPendingAmount = banksPending.reduce((acc, b) => acc + Math.abs(b.amount), 0);
  const banksReconciledAmount = banksPending.reduce((acc, b) => acc + Math.abs(b.reconciled), 0);

  const periodLabel = formatPeriodLabel(filter);
  const monthLabel = (lm: { month: number } | null): string =>
    lm ? formatMonthLabel(filter.year, lm.month - 1) : "—";

  return {
    sales: {
      kpiYear: {
        label: "Total facturado",
        period: periodLabel,
        value: fmtMoney(salesTotalYear),
        isNegative: salesTotalYear < 0,
      },
      kpiMonth: {
        label: "Total último mes del periodo",
        period: monthLabel(salesLastMonth),
        value: fmtMoney(salesTotalMonth),
        isNegative: salesTotalMonth < 0,
      },
      monthly: salesMonthly,
      pending: {
        label: "Total vencido + pendiente",
        subtotal: fmtMoney(salesPendingSubtotal),
        total: fmtMoney(salesPendingTotal),
        collected: fmtMoney(salesPendingCollected),
      },
      rows: salesRows,
    },
    purchases: {
      kpiYear: {
        label: "Total facturas recibidas",
        period: periodLabel,
        value: fmtMoney(purchasesTotalYear),
        isNegative: purchasesTotalYear < 0,
      },
      kpiMonth: {
        label: "Total último mes del periodo",
        period: monthLabel(purchasesLastMonth),
        value: fmtMoney(purchasesTotalMonth),
        isNegative: purchasesTotalMonth < 0,
      },
      monthly: purchasesMonthly,
      pending: {
        label: "Total vencido + pendiente",
        subtotal: fmtMoney(purchasesPendingSubtotal),
        total: fmtMoney(purchasesPendingTotal),
        paid: fmtMoney(purchasesPendingPaid),
      },
      rows: purchasesRows,
    },
    banks: {
      kpiYear: {
        label: "Cashflow total periodo",
        period: periodLabel,
        value: fmtMoney(banksCashflowYear),
        isNegative: banksCashflowYear < 0,
      },
      kpiMonth: {
        label: "Cashflow último mes del periodo",
        period: monthLabel(banksLastMonth),
        value: fmtMoney(banksCashflowMonth),
        isNegative: banksCashflowMonth < 0,
      },
      pending: {
        label: "Total pendiente de conciliar",
        pending: fmtMoney(banksPendingAmount),
        reconciled: fmtMoney(banksReconciledAmount),
      },
      accounts,
      selectedAccount,
    },
  };
}

// ---------------------------------------------------------------------------
// Filtros UI
// ---------------------------------------------------------------------------

export function buildPeriodOptions(currentYear: number): PeriodOption[] {
  return [
    { id: "year", label: `${currentYear} completo`, filter: { kind: "year", year: currentYear } },
    { id: "q1", label: `Q1`, filter: { kind: "quarter", year: currentYear, quarter: 1 } },
    { id: "q2", label: `Q2`, filter: { kind: "quarter", year: currentYear, quarter: 2 } },
    { id: "q3", label: `Q3`, filter: { kind: "quarter", year: currentYear, quarter: 3 } },
    { id: "q4", label: `Q4`, filter: { kind: "quarter", year: currentYear, quarter: 4 } },
  ];
}

export function resolvePeriodFromId(id: string | undefined, currentYear: number): PeriodFilter {
  const opts = buildPeriodOptions(currentYear);
  const found = opts.find((o) => o.id === id);
  return found ? found.filter : opts[0].filter;
}
