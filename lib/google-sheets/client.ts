import { google, sheets_v4 } from "googleapis";
import { formatEur } from "@/lib/format";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new DashboardSheetError(
      "missing_credentials",
      "Faltan GOOGLE_OAUTH_CLIENT_ID o GOOGLE_OAUTH_CLIENT_SECRET en el entorno."
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret);
}

function getAuth() {
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new DashboardSheetError(
      "missing_credentials",
      "Falta GOOGLE_OAUTH_REFRESH_TOKEN en el entorno. Genera uno desde /admin/dashboard-oauth-setup."
    );
  }
  const oauth = getOAuth2Client();
  oauth.setCredentials({ refresh_token: refreshToken });
  return oauth;
}

function getSheetsClient(): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth: getAuth() });
}

export class DashboardSheetError extends Error {
  constructor(
    public code:
      | "missing_credentials"
      | "sheet_not_shared"
      | "sheet_not_found"
      | "tab_not_found"
      | "unknown",
    message: string
  ) {
    super(message);
    this.name = "DashboardSheetError";
  }
}

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
  date: string; // DD/MM/YYYY
  documentNumber: string; // Nº documento de la factura (puede venir vacío)
  subtotal: string;
  total: string;
  collected: string;
  status: string;
};

export type PurchaseDetail = {
  date: string; // DD/MM/YYYY
  documentNumber: string; // Nº documento de la factura (puede venir vacío)
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
  monthKey: string; // YYYY-MM
  label: string; // "ene 26"
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
    accounts: string[]; // cuentas únicas para selector
    selectedAccount: string | null; // null = todas
  };
};

// ---------------------------------------------------------------------------
// Tipos internos (raw data + agregación)
// ---------------------------------------------------------------------------

// Patrones para localizar las pestañas crudas en el Sheet del cliente.
// Tolera variaciones de naming (espacios, mayúsculas, sufijos, idiomas).
const RAW_SHEET_PATTERNS: Record<"sales" | "purchases" | "banks", { regex: RegExp; hint: string }> = {
  sales: { regex: /factura.*venta/i, hint: "facturas de venta (p.ej. 'facturasVentaHolded_lineas')" },
  purchases: { regex: /factura.*compra/i, hint: "facturas de compra (p.ej. 'Facturas_compra_holded')" },
  banks: { regex: /(extracto|movimiento|banc)/i, hint: "extractos bancarios (p.ej. 'extractosBancarios')" },
};

interface RawSaleRow {
  date: string; // YYYY-MM-DD
  client: string;
  documentNumber: string;
  subtotal: number;
  total: number;
  collected: number;
  status: string;
}
interface RawPurchaseRow {
  date: string;
  provider: string;
  documentNumber: string;
  subtotal: number;
  total: number;
  paid: number;
  status: string;
}
interface RawBankRow {
  date: string;
  description: string;
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
  yearsAvailable: number[]; // años con al menos 1 fila en cualquier dataset
  bankAccounts: string[]; // cuentas bancarias únicas presentes en extractos
}

// ---------------------------------------------------------------------------
// Helpers parsing
// ---------------------------------------------------------------------------

function parseGoogleApiError(err: unknown): DashboardSheetError {
  const e = err as { code?: number; errors?: Array<{ message?: string }>; message?: string };
  const code = e?.code;
  const message = e?.errors?.[0]?.message || e?.message || "Error desconocido";
  if (code === 403) {
    return new DashboardSheetError(
      "sheet_not_shared",
      "La cuenta autorizada no tiene acceso a este Sheet. Comprueba que la cuenta de Google del refresh token (p.ej. tech@leanfinance.es) sea lectora del documento."
    );
  }
  if (code === 404) {
    return new DashboardSheetError("sheet_not_found", "Sheet no encontrado.");
  }
  if (typeof message === "string" && message.toLowerCase().includes("unable to parse range")) {
    return new DashboardSheetError(
      "tab_not_found",
      "Falta alguna pestaña esperada en el Sheet."
    );
  }
  return new DashboardSheetError("unknown", `No se pudo leer el Sheet: ${message}`);
}

function quoteSheetName(name: string): string {
  if (/^[A-Za-z0-9_]+$/.test(name)) return name;
  return `'${name.replace(/'/g, "''")}'`;
}

const NUM_RE = /-?\d+(?:[.,]\d+)?/;

function toNumber(v: string | undefined): number {
  if (!v) return 0;
  const s = v.toString().trim();
  if (!s) return 0;
  // Si formato europeo "1.234,56" → quitar puntos de millar y cambiar coma por punto.
  // Si formato anglo "1,234.56" → quitar comas.
  // Heurística simple: si última coma viene después del último punto, es decimal europeo.
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s.replace(/,/g, "");
  }
  // Quitar símbolos (€, espacios, etc) excepto signo y dígitos/punto.
  const m = normalized.match(NUM_RE);
  if (!m) return 0;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : 0;
}

function serialToIso(serial: number): string {
  // Excel epoch: 1899-12-30 (corrige el bug del año 1900 de Lotus 1-2-3).
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + serial * 86400 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return serialToIso(v);

  const s = v.toString().trim();
  if (!s) return null;

  // Si es string puramente numérico (Sheets devuelve a veces el serial como string), parsear como serial.
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    // Rango razonable: 1 (1900-01-01) hasta ~80000 (~2118). Evita parsear años sueltos como fecha.
    if (Number.isFinite(n) && n > 1000 && n < 80000) return serialToIso(n);
  }

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const euroMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (euroMatch) {
    const [, d, m, y] = euroMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
}

// Formatea importes con separador de miles "." y decimales con coma (formato
// español). Reusa el helper compartido en `lib/format` para que toda la app
// muestre los importes igual.
function fmtMoney(n: number): string {
  return formatEur(n);
}

// Recibe una fecha en formato YYYY-MM-DD y devuelve DD/MM/YYYY.
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
// Lectura cruda desde Sheets
// ---------------------------------------------------------------------------

async function resolveSheetTabs(
  sheets: sheets_v4.Sheets,
  sheetId: string
): Promise<{ sales: string; purchases: string; banks: string }> {
  let meta;
  try {
    meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets.properties.title",
    });
  } catch (err) {
    throw parseGoogleApiError(err);
  }
  const titles = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => typeof t === "string");

  function pick(key: "sales" | "purchases" | "banks"): string {
    const { regex, hint } = RAW_SHEET_PATTERNS[key];
    const match = titles.find((t) => regex.test(t));
    if (!match) {
      throw new DashboardSheetError(
        "tab_not_found",
        `No encuentro la pestaña de ${hint}. Pestañas presentes: ${titles.join(", ") || "(ninguna)"}.`
      );
    }
    return match;
  }

  return { sales: pick("sales"), purchases: pick("purchases"), banks: pick("banks") };
}

// Patrones de cabeceras que pueden cambiar entre clientes.
// Usamos regex case-insensitive (mismo patrón que ya aplicamos a los títulos
// de pestañas) para tolerar variaciones de naming sin romper la integración.
const SALES_DOC_NUMBER_HEADER_RE = /(n(º|°|um(ero)?)?\.?\s*documento|n(º|°|um(ero)?)?\.?\s*factura|n(º|°|um(ero)?)?\.?\s*doc\.?)/i;
const PURCHASES_DOC_NUMBER_HEADER_RE = /^(num(ero)?|n(º|°)\.?\s*(factura|documento)?|num\s*interno)$/i;
const PURCHASES_DOC_INTERNAL_HEADER_RE = /num\s*interno/i;
const BANK_DESCRIPTION_HEADER_RE = /(descripci(ó|o)n|concepto|referencia)/i;

function findHeaderIndex(headers: string[], re: RegExp): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").toString().trim();
    if (h && re.test(h)) return i;
  }
  return -1;
}

export async function getRawDashboardData(sheetId: string): Promise<RawDashboardData> {
  const sheets = getSheetsClient();
  const tabs = await resolveSheetTabs(sheets, sheetId);
  // Leemos desde A1 para capturar la fila de cabeceras y poder localizar
  // columnas por nombre (p.ej. "Número Documento" en ventas, "Num" en compras).
  const ranges = [
    `${quoteSheetName(tabs.sales)}!A1:AD`,
    `${quoteSheetName(tabs.purchases)}!A1:T`,
    `${quoteSheetName(tabs.banks)}!A1:I`,
  ];

  let res;
  try {
    res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    });
  } catch (err) {
    throw parseGoogleApiError(err);
  }

  const valueRanges = res.data.valueRanges ?? [];
  const salesAll = (valueRanges[0]?.values ?? []) as string[][];
  const purchasesAll = (valueRanges[1]?.values ?? []) as string[][];
  const banksAll = (valueRanges[2]?.values ?? []) as string[][];

  const salesHeaders = (salesAll[0] ?? []).map((v) => (v ?? "").toString());
  const purchasesHeaders = (purchasesAll[0] ?? []).map((v) => (v ?? "").toString());
  const banksHeaders = (banksAll[0] ?? []).map((v) => (v ?? "").toString());

  const salesRows = salesAll.slice(1);
  const purchasesRows = purchasesAll.slice(1);
  const banksRows = banksAll.slice(1);

  // Localizamos la columna de Nº documento por nombre de cabecera. Fallback al
  // índice esperado del template Holded (col 2 = "Número Documento" en ventas;
  // col 1 = "Num" en compras) si no encontramos la cabecera.
  const salesDocIdx = findHeaderIndex(salesHeaders, SALES_DOC_NUMBER_HEADER_RE);
  const salesDocColumn = salesDocIdx >= 0 ? salesDocIdx : 2;
  // En compras preferimos "Num" sobre "Num interno" si ambos están presentes:
  // "Num" es el número de factura visible para el proveedor.
  let purchasesDocIdx = -1;
  for (let i = 0; i < purchasesHeaders.length; i++) {
    const h = (purchasesHeaders[i] ?? "").toString().trim();
    if (!h) continue;
    if (PURCHASES_DOC_INTERNAL_HEADER_RE.test(h)) continue;
    if (PURCHASES_DOC_NUMBER_HEADER_RE.test(h)) {
      purchasesDocIdx = i;
      break;
    }
  }
  const purchasesDocColumn = purchasesDocIdx >= 0 ? purchasesDocIdx : 1;
  const banksDescIdx = findHeaderIndex(banksHeaders, BANK_DESCRIPTION_HEADER_RE);
  const banksDescColumn = banksDescIdx >= 0 ? banksDescIdx : 1;

  const sales: RawSaleRow[] = [];
  // Columnas (0-indexed) en el template Holded: A=Fecha, C=Número Documento(2),
  // E=Cliente(4), Q=Subtotal Línea(16), S=Total Línea(18), AC=Cantidad Cobrada(28),
  // AD=Estado Cliente(29).
  for (const r of salesRows) {
    const date = parseDate(r[0]);
    if (!date) continue;
    const client = (r[4] ?? "").toString().trim() || "(Sin cliente)";
    const documentNumber = (r[salesDocColumn] ?? "").toString().trim();
    sales.push({
      date,
      client,
      documentNumber,
      subtotal: toNumber(r[16]),
      total: toNumber(r[18]),
      collected: toNumber(r[28]),
      status: (r[29] ?? "").toString().trim(),
    });
  }

  const purchases: RawPurchaseRow[] = [];
  // Columnas: Fecha emisión=A(0), Num=B(1), Num interno=C(2), Fecha contable=D(3),
  // Proveedor=F(5), Subtotal=K(10), Total=P(15), Pagado=Q(16), Estado=S(18)
  for (const r of purchasesRows) {
    // Fallback: si Fecha emisión está vacía o no parsea, usamos Fecha contable.
    const date = parseDate(r[0]) ?? parseDate(r[3]);
    if (!date) continue;
    const provider = (r[5] ?? "").toString().trim() || "(Sin proveedor)";
    const documentNumber = (r[purchasesDocColumn] ?? "").toString().trim();
    purchases.push({
      date,
      provider,
      documentNumber,
      subtotal: toNumber(r[10]),
      total: toNumber(r[15]),
      paid: toNumber(r[16]),
      status: (r[18] ?? "").toString().trim(),
    });
  }

  const banks: RawBankRow[] = [];
  // Columnas: Fecha=A(0), Descripción=B(1), Importe=C(2), Conciliado=E(4),
  // Estado=G(6), Cuenta=H(7)
  for (const r of banksRows) {
    const date = parseDate(r[0]);
    if (!date) continue;
    const description = (r[banksDescColumn] ?? "").toString().trim();
    banks.push({
      date,
      description,
      amount: toNumber(r[2]),
      reconciled: toNumber(r[4]),
      status: (r[6] ?? "").toString().trim(),
      account: (r[7] ?? "").toString().trim(),
    });
  }

  const yearsSet = new Set<number>();
  for (const s of sales) yearsSet.add(Number(s.date.slice(0, 4)));
  for (const p of purchases) yearsSet.add(Number(p.date.slice(0, 4)));
  for (const b of banks) yearsSet.add(Number(b.date.slice(0, 4)));
  const yearsAvailable = Array.from(yearsSet).filter((y) => Number.isFinite(y)).sort((a, b) => b - a);

  const accountsSet = new Set<string>();
  for (const b of banks) if (b.account) accountsSet.add(b.account);
  const bankAccounts = Array.from(accountsSet).sort();

  return {
    sales,
    purchases,
    banks,
    fetchedAt: new Date().toISOString(),
    yearsAvailable,
    bankAccounts,
  };
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
  // last_month: del año dado, el mes más reciente con datos lo decide el caller con `fillRangeWithLastMonth`.
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
      // Estado consolidado: si hay vencido, mostramos vencido; si no, pendiente.
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

  // Para coincidir con el GS, los gráficos de compras suman SUBTOTAL (sin IVA).
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
  // GS muestra el "pendiente de conciliar" como magnitud (valor absoluto),
  // no como cashflow firmado. Coincidimos con esa convención.
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

// ---------------------------------------------------------------------------
// URL parser (la usa el server action de admin para validar)
// ---------------------------------------------------------------------------

export function parseSheetUrl(
  url: string
): { sheetId: string; gid: number | null } | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return null;
  const sheetId = idMatch[1];
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? Number(gidMatch[1]) : null;
  return { sheetId, gid };
}

// Compatibilidad: el server action setDashboardSheet llama a esto para validar
// que el sheet existe y se puede leer antes de guardar la config.
export async function getDashboardData(
  sheetId: string,
  _sheetName?: string
): Promise<DashboardData> {
  const raw = await getRawDashboardData(sheetId);
  const currentYear = new Date().getFullYear();
  return aggregateDashboard(raw, { kind: "year", year: currentYear });
}
