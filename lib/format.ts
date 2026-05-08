// Helpers de formato compartidos por la app.
// Usar SIEMPRE estos helpers para mostrar importes; así garantizamos que el
// separador de miles sea "." y los decimales "," (formato español) en toda la
// UI (KPIs, tablas, tooltips de gráficos, etc.).

const eurFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eurFormatterNoDecimals = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formatea un importe en euros con separador de miles "." y decimales con coma
 * (p.ej. 1234567.89 → "1.234.567,89 €").
 */
export function formatEur(n: number): string {
  if (!Number.isFinite(n)) return eurFormatter.format(0);
  return eurFormatter.format(n);
}

/**
 * Variante sin decimales — útil para KPIs grandes donde los céntimos generan
 * ruido visual. Mantiene el separador de miles ".".
 */
export function formatEurNoDecimals(n: number): string {
  if (!Number.isFinite(n)) return eurFormatterNoDecimals.format(0);
  return eurFormatterNoDecimals.format(n);
}

/**
 * Formatea un número (sin símbolo de moneda) en formato español.
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return numberFormatter.format(0);
  return numberFormatter.format(n);
}

/**
 * Versión compacta para ticks de gráficos. Mantiene los separadores españoles.
 * Ej: 1234567 → "1,2 M €", 12340 → "12 k €".
 */
export function formatEurCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M €`;
  }
  if (abs >= 1_000) {
    return `${Math.round(n / 1000)} k €`;
  }
  return formatEurNoDecimals(n);
}
