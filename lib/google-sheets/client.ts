// Fetch del Google Sheet (server-only — usa `googleapis`). La agregación pura
// vive en `lib/dashboard/aggregate.ts` para poder consumirse desde el cliente
// sin arrastrar `googleapis` al bundle.

import { google, sheets_v4 } from "googleapis";
import {
  aggregateDashboard,
  type DashboardData,
  type RawDashboardData,
  type RawSaleRow,
  type RawPurchaseRow,
  type RawBankRow,
} from "@/lib/dashboard/aggregate";

// Re-export para compatibilidad con consumidores existentes.
export {
  aggregateDashboard,
  buildPeriodOptions,
  resolvePeriodFromId,
} from "@/lib/dashboard/aggregate";
export type {
  PeriodFilter,
  PeriodOption,
  KpiCard,
  SalesTotals,
  PurchaseTotals,
  BankPendingTotals,
  SaleDetail,
  PurchaseDetail,
  SaleRow,
  PurchaseRow,
  MonthlyPoint,
  DashboardData,
  RawDashboardData,
} from "@/lib/dashboard/aggregate";

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
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s.replace(/,/g, "");
  }
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

  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
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

// ---------------------------------------------------------------------------
// Lectura cruda desde Sheets
// ---------------------------------------------------------------------------

// Patrones para localizar las pestañas crudas en el Sheet del cliente.
const RAW_SHEET_PATTERNS: Record<"sales" | "purchases" | "banks", { regex: RegExp; hint: string }> = {
  sales: { regex: /factura.*venta/i, hint: "facturas de venta (p.ej. 'facturasVentaHolded_lineas')" },
  purchases: { regex: /factura.*compra/i, hint: "facturas de compra (p.ej. 'Facturas_compra_holded')" },
  banks: { regex: /(extracto|movimiento|banc)/i, hint: "extractos bancarios (p.ej. 'extractosBancarios')" },
};

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

  const salesDocIdx = findHeaderIndex(salesHeaders, SALES_DOC_NUMBER_HEADER_RE);
  const salesDocColumn = salesDocIdx >= 0 ? salesDocIdx : 2;
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
  for (const r of purchasesRows) {
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
