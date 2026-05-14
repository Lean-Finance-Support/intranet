/**
 * Motor de reglas para evaluar elegibilidad de deducciones autonómicas.
 *
 * Las reglas se almacenan en `renta.deductions.eligibility_rule` como JSONB
 * y se evalúan contra un perfil de respuesta (`RentaProfileResponse`).
 *
 * Diseño:
 *   - AST puro, sin side-effects.
 *   - Path con notación dot: `housing.type`, `kids.length`.
 *   - Paths faltantes → la condición devuelve `false` (no lanza).
 *   - Operadores específicos para edad: `age_gte`/`age_lt` calculan años a partir
 *     de una fecha ISO. Reduce la fricción de tener que pre-calcular edades.
 *   - Operadores para colecciones de hijos: `any_kid_age_lt`, `any_kid_age_between`.
 */

import type { RentaProfileResponse, RentaRule } from "@/lib/types/renta";

export function evaluateRule(rule: RentaRule, profile: Partial<RentaProfileResponse>): boolean {
  if (!rule || typeof rule !== "object") return false;

  if ("all_of" in rule) {
    return rule.all_of.every((r) => evaluateRule(r, profile));
  }
  if ("any_of" in rule) {
    return rule.any_of.some((r) => evaluateRule(r, profile));
  }
  if ("not" in rule) {
    return !evaluateRule(rule.not, profile);
  }
  if (!("op" in rule)) return false;

  switch (rule.op) {
    case "eq":
      return getPath(profile, rule.path) === rule.value;
    case "neq":
      return getPath(profile, rule.path) !== rule.value;
    case "gt":
      return toNumber(getPath(profile, rule.path)) > rule.value;
    case "gte":
      return toNumber(getPath(profile, rule.path)) >= rule.value;
    case "lt":
      return toNumber(getPath(profile, rule.path)) < rule.value;
    case "lte":
      return toNumber(getPath(profile, rule.path)) <= rule.value;
    case "in":
      return Array.isArray(rule.value) && rule.value.includes(getPath(profile, rule.path));
    case "between": {
      const n = toNumber(getPath(profile, rule.path));
      const [min, max] = rule.value;
      return n >= min && n <= max;
    }
    case "truthy":
      return Boolean(getPath(profile, rule.path));
    case "age_gte": {
      const date = getPath(profile, rule.path);
      const age = computeAgeYears(date);
      return age !== null && age >= rule.value;
    }
    case "age_lt": {
      const date = getPath(profile, rule.path);
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
 * Filtra el catálogo de deducciones devolviendo solo las aplicables al perfil.
 */
export function filterApplicableDeductions<T extends { eligibility_rule: RentaRule }>(
  deductions: T[],
  profile: Partial<RentaProfileResponse>,
): T[] {
  return deductions.filter((d) => evaluateRule(d.eligibility_rule, profile));
}
