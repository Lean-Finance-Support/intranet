/**
 * Motor de reglas para evaluar elegibilidad de deducciones autonómicas.
 *
 * Las reglas se almacenan en `renta.deductions.eligibility_rule` como JSONB
 * y se evalúan contra un perfil de respuesta (`RentaProfileResponse`).
 *
 * Diseño:
 *   - AST puro, sin side-effects.
 *   - Path con notación dot: `housing.type`, `kids.length`.
 *   - Lógica de tres estados: una hoja cuyo path NO está cumplimentado en el
 *     perfil devuelve `"unknown"` (no `false`). Así, una deducción cuya
 *     elegibilidad depende de un campo opcional sin contestar (p.ej.
 *     `income_base` o `declaration_mode`) NO se descarta: se muestra al
 *     contribuyente para que él decida ("Sí" / "No estoy seguro"). Solo se
 *     descartan las deducciones cuya regla es definitivamente `false`.
 *   - Operadores específicos para edad: `age_gte`/`age_lt` calculan años a partir
 *     de una fecha ISO. Reduce la fricción de tener que pre-calcular edades.
 *   - Operadores para colecciones de hijos: `any_kid_age_lt`, `any_kid_age_between`.
 */

import type { RentaProfileResponse, RentaRule } from "@/lib/types/renta";

type Tri = true | false | "unknown";

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * Evalúa una regla devolviendo tres estados. `"unknown"` significa "no se
 * puede determinar con los datos aportados" — la regla depende de un campo que
 * el contribuyente no ha cumplimentado.
 */
function evaluateTri(rule: RentaRule, profile: Partial<RentaProfileResponse>): Tri {
  if (!rule || typeof rule !== "object") return false;

  if ("all_of" in rule) {
    const results = rule.all_of.map((r) => evaluateTri(r, profile));
    if (results.some((r) => r === false)) return false;
    if (results.some((r) => r === "unknown")) return "unknown";
    return true;
  }
  if ("any_of" in rule) {
    const results = rule.any_of.map((r) => evaluateTri(r, profile));
    if (results.some((r) => r === true)) return true;
    if (results.some((r) => r === "unknown")) return "unknown";
    return false;
  }
  if ("not" in rule) {
    const inner = evaluateTri(rule.not, profile);
    if (inner === "unknown") return "unknown";
    return !inner;
  }
  if (!("op" in rule)) return false;

  switch (rule.op) {
    case "eq": {
      const v = getPath(profile, rule.path);
      if (isMissing(v)) return "unknown";
      return v === rule.value;
    }
    case "neq": {
      const v = getPath(profile, rule.path);
      if (isMissing(v)) return "unknown";
      return v !== rule.value;
    }
    case "gt": {
      const v = getPath(profile, rule.path);
      if (isMissing(v)) return "unknown";
      return toNumber(v) > rule.value;
    }
    case "gte": {
      const v = getPath(profile, rule.path);
      if (isMissing(v)) return "unknown";
      return toNumber(v) >= rule.value;
    }
    case "lt": {
      const v = getPath(profile, rule.path);
      if (isMissing(v)) return "unknown";
      return toNumber(v) < rule.value;
    }
    case "lte": {
      const v = getPath(profile, rule.path);
      if (isMissing(v)) return "unknown";
      return toNumber(v) <= rule.value;
    }
    case "in": {
      const v = getPath(profile, rule.path);
      if (isMissing(v)) return "unknown";
      return Array.isArray(rule.value) && rule.value.includes(v);
    }
    case "between": {
      const v = getPath(profile, rule.path);
      if (isMissing(v)) return "unknown";
      const n = toNumber(v);
      const [min, max] = rule.value;
      return n >= min && n <= max;
    }
    case "truthy": {
      const v = getPath(profile, rule.path);
      if (isMissing(v)) return "unknown";
      return Boolean(v);
    }
    case "age_gte": {
      const date = getPath(profile, rule.path);
      if (isMissing(date)) return "unknown";
      const age = computeAgeYears(date);
      return age !== null && age >= rule.value;
    }
    case "age_lt": {
      const date = getPath(profile, rule.path);
      if (isMissing(date)) return "unknown";
      const age = computeAgeYears(date);
      return age !== null && age < rule.value;
    }
    case "any_kid_age_lt": {
      const kids = (profile.kids ?? []) as { birth_date: string }[];
      const threshold = rule.value as number;
      return kids.some((k) => {
        const age = computeAgeYears(k.birth_date);
        return age !== null && age < threshold;
      });
    }
    case "any_kid_age_between": {
      const kids = (profile.kids ?? []) as { birth_date: string }[];
      const [min, max] = rule.value as [number, number];
      return kids.some((k) => {
        const age = computeAgeYears(k.birth_date);
        return age !== null && age >= min && age <= max;
      });
    }
    default:
      return false;
  }
}

/**
 * ¿La deducción cumple la regla de forma estricta? Solo `true` definitivo.
 * Usado donde se necesita certeza absoluta.
 */
export function evaluateRule(rule: RentaRule, profile: Partial<RentaProfileResponse>): boolean {
  return evaluateTri(rule, profile) === true;
}

/**
 * ¿La deducción podría aplicar? `true` o `"unknown"` → sí (se muestra al
 * contribuyente). Solo se descarta cuando la regla es definitivamente `false`.
 * Este es el criterio que usa el formulario público y la re-evaluación
 * anti-inyección del servidor: nunca ocultamos una deducción solo porque el
 * usuario dejó un campo opcional en blanco.
 */
export function isPotentiallyApplicable(
  rule: RentaRule,
  profile: Partial<RentaProfileResponse>,
): boolean {
  return evaluateTri(rule, profile) !== false;
}

function getPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  const segments = path.split(".");
  let current: unknown = obj;
  for (const segment of segments) {
    if (current == null) return undefined;
    if (segment === "length" && Array.isArray(current)) {
      return current.length;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }
  if (value instanceof Date) return value.getTime();
  return NaN;
}

/**
 * Calcula la edad en años cumplidos a 31/12 del año fiscal actual.
 * Para una declaración de renta del ejercicio Y, lo correcto en muchas
 * deducciones es "edad a 31 de diciembre del ejercicio". Por defecto usamos
 * el año fiscal de referencia configurable por env (`RENTA_FISCAL_YEAR`,
 * defecto = año actual - 1, p.ej. 2025 para la campaña de 2026).
 */
export function computeAgeYears(dateIso: unknown, referenceYear?: number): number | null {
  if (typeof dateIso !== "string") return null;
  const birth = new Date(dateIso);
  if (Number.isNaN(birth.getTime())) return null;
  const year = referenceYear ?? defaultFiscalYear();
  const refDate = new Date(`${year}-12-31`);
  let age = refDate.getFullYear() - birth.getFullYear();
  const m = refDate.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < birth.getDate())) age--;
  return age;
}

function defaultFiscalYear(): number {
  const envYear = process.env.RENTA_FISCAL_YEAR;
  if (envYear) {
    const n = Number(envYear);
    if (Number.isFinite(n)) return n;
  }
  return new Date().getFullYear() - 1;
}

/**
 * Filtra el catálogo de deducciones devolviendo las que podrían aplicar al
 * perfil (incluye las `"unknown"` por campos opcionales sin contestar).
 */
export function filterApplicableDeductions<T extends { eligibility_rule: RentaRule }>(
  deductions: T[],
  profile: Partial<RentaProfileResponse>,
): T[] {
  return deductions.filter((d) => isPotentiallyApplicable(d.eligibility_rule, profile));
}
