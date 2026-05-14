/**
 * Convierte un `RentaRule` (AST de elegibilidad) en una lista de strings legibles
 * en castellano para mostrarlos al usuario como "requisitos que cumples" en el
 * wizard de deducciones del formulario público de la renta.
 *
 * Notas de diseño:
 *  - **Solo lectura**: no muta ni evalúa la regla. Cuando se llama desde el
 *    wizard, todas las condiciones del AST ya pasan (los datos del perfil
 *    satisfacen la regla), por lo que el output es una lista de hechos
 *    confirmados.
 *  - **Filtro de CCAA**: las reglas `{ op: "eq", path: "ccaa", value: "ES-XX" }`
 *    se omiten porque ya filtramos por CCAA antes — el usuario no necesita ver
 *    "Residir en Andalucía" si está rellenando el formulario en Andalucía.
 *  - **Anidados (`any_of`)**: para no perder estructura, los hijos de un
 *    `any_of` se prefijan con `"› "` (un guion tipográfico). El consumidor
 *    puede decidir indentarlos visualmente; en la práctica un `<li>` con
 *    `pl-3` ya queda bien.
 *  - **Fallback**: si una combinación path+op no está mapeada explícitamente,
 *    se devuelve un string razonable (path + operador + valor). Mejor un
 *    fallback feo que una lista vacía o un crash.
 *  - **Entradas vacías**: los operadores omitidos (CCAA) devuelven string
 *    vacío y `humanizeRule` los filtra del output final.
 */

import type { RentaRule } from "@/lib/types/renta";

/** Prefijo usado para marcar bullets anidados dentro de un `any_of`. */
const NESTED_PREFIX = "› ";

/**
 * Convierte un `RentaRule` en una lista plana de bullets en castellano.
 * Strings vacíos (operadores omitidos) se filtran del resultado.
 */
export function humanizeRule(rule: RentaRule): string[] {
  return collect(rule).filter((s) => s.trim() !== "");
}

/**
 * Recoge bullets de una regla. Devuelve `string[]` plano; los bullets
 * anidados (hijos de `any_of`) van prefijados con `NESTED_PREFIX`.
 */
function collect(rule: RentaRule): string[] {
  if (!rule || typeof rule !== "object") return [];

  if ("all_of" in rule) {
    return rule.all_of.flatMap((r) => collect(r));
  }

  if ("any_of" in rule) {
    const children = rule.any_of.flatMap((r) => collect(r));
    if (children.length === 0) return [];
    return ["Cumplir alguno de los siguientes:", ...children.map((c) => NESTED_PREFIX + c)];
  }

  if ("not" in rule) {
    const inner = collect(rule.not);
    return inner.map((s) => `No: ${s}`);
  }

  if (!("op" in rule)) return [];

  const text = humanizeLeaf(rule);
  return text ? [text] : [];
}

type LeafRule = Extract<RentaRule, { op: string }>;

/**
 * Traduce una hoja del AST (un operador concreto sobre un path) a texto.
 * Devuelve `""` para reglas que se omiten deliberadamente (p.ej. el filtro
 * de CCAA, que el wizard ya garantiza).
 */
function humanizeLeaf(rule: LeafRule): string {
  switch (rule.op) {
    case "eq":
      return humanizeEq(rule.path, rule.value);
    case "neq":
      return humanizeNeq(rule.path, rule.value);
    case "in":
      return humanizeIn(rule.path, rule.value as unknown[]);
    case "truthy":
      return humanizeTruthy(rule.path);
    case "age_gte":
      return `Tener ${rule.value} años o más`;
    case "age_lt":
      return `Tener menos de ${rule.value} años`;
    case "any_kid_age_lt":
      return `Tener al menos un hijo menor de ${rule.value as number} años`;
    case "any_kid_age_between": {
      const [min, max] = rule.value as [number, number];
      return `Tener al menos un hijo de entre ${min} y ${max} años`;
    }
    case "gte":
      return humanizeGte(rule.path, rule.value);
    case "gt":
      return humanizeGt(rule.path, rule.value);
    case "lte":
      return humanizeLte(rule.path, rule.value);
    case "lt":
      return humanizeLt(rule.path, rule.value);
    case "between":
      return humanizeBetween(rule.path, rule.value as [number, number]);
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Traducciones específicas por path
// ---------------------------------------------------------------------------

const CIVIL_STATUS_LABELS: Record<string, string> = {
  soltero: "Estar soltero/a",
  casado: "Estar casado/a",
  pareja_de_hecho: "Estar registrado/a como pareja de hecho",
  viudo: "Estar viudo/a",
  separado: "Estar separado/a",
  divorciado: "Estar divorciado/a",
};

const HOUSING_TYPE_LABELS: Record<string, string> = {
  alquiler: "Vivir de alquiler",
  propiedad: "Tener vivienda en propiedad",
  otro: "Tener otro régimen de vivienda (cesión, usufructo, etc.)",
};

const LARGE_FAMILY_LABELS: Record<string, string> = {
  general: "general",
  especial: "especial",
  no: "no",
};

function humanizeEq(path: string, value: unknown): string {
  // El filtro por CCAA ya se aplica antes; no aporta nada al usuario.
  if (path === "ccaa") return "";

  if (path === "housing.type" && typeof value === "string" && HOUSING_TYPE_LABELS[value]) {
    return HOUSING_TYPE_LABELS[value];
  }

  if (path === "civil_status" && typeof value === "string" && CIVIL_STATUS_LABELS[value]) {
    return CIVIL_STATUS_LABELS[value];
  }

  if (path === "monoparental" && value === true) return "Ser familia monoparental";
  if (path === "monoparental" && value === false) return "No ser familia monoparental";

  if (path === "small_municipality" && value === true) {
    return "Residir en municipio pequeño o en riesgo de despoblación";
  }
  if (path === "small_municipality" && value === false) {
    return "No residir en municipio pequeño o en riesgo de despoblación";
  }

  if (path === "declaration_mode" && value === "individual") return "Presentar declaración individual";
  if (path === "declaration_mode" && value === "conjunta") return "Presentar declaración conjunta";

  if (path === "large_family" && typeof value === "string") {
    if (value === "no") return "No ser familia numerosa";
    const label = LARGE_FAMILY_LABELS[value] ?? value;
    return `Ser familia numerosa (${label})`;
  }

  if (path === "housing.is_habitual" && value === true) return "Que sea tu vivienda habitual";
  if (path === "housing.is_habitual" && value === false) return "Que no sea tu vivienda habitual";

  // Fallback genérico.
  return `${prettyPath(path)} = ${formatValue(value)}`;
}

function humanizeNeq(path: string, value: unknown): string {
  if (path === "ccaa") return "";
  if (path === "civil_status" && typeof value === "string" && CIVIL_STATUS_LABELS[value]) {
    return `No ${CIVIL_STATUS_LABELS[value].toLowerCase()}`;
  }
  return `${prettyPath(path)} distinto de ${formatValue(value)}`;
}

function humanizeIn(path: string, values: unknown[]): string {
  if (path === "ccaa") return "";

  if (path === "large_family") {
    const labels = values
      .filter((v): v is string => typeof v === "string")
      .map((v) => LARGE_FAMILY_LABELS[v] ?? v);
    if (labels.length === 0) return "Ser familia numerosa";
    return `Ser familia numerosa (${labels.join(" o ")})`;
  }

  if (path === "civil_status") {
    const labels = values
      .filter((v): v is string => typeof v === "string")
      .map((v) => CIVIL_STATUS_LABELS[v] ?? v)
      .map((s) => s.replace(/^Estar /, ""));
    if (labels.length > 0) return `Estar ${labels.join(" o ")}`;
  }

  if (path === "housing.type") {
    const labels = values
      .filter((v): v is string => typeof v === "string")
      .map((v) => HOUSING_TYPE_LABELS[v] ?? v);
    if (labels.length > 0) return labels.join(" o ");
  }

  return `${prettyPath(path)} debe ser uno de: ${values.map(formatValue).join(", ")}`;
}

function humanizeTruthy(path: string): string {
  if (path === "monoparental") return "Ser familia monoparental";
  if (path === "small_municipality") return "Residir en municipio pequeño o en riesgo de despoblación";
  if (path === "disability_pct") return "Tener algún grado de discapacidad reconocido";
  return `${prettyPath(path)} cumplido`;
}

function humanizeGte(path: string, value: number): string {
  if (path === "disability_pct") return `Tener un grado de discapacidad ≥ ${value}%`;
  if (path === "income_base") return `Base liquidable estimada ≥ ${formatEuro(value)}`;
  if (path === "kids.length") {
    if (value === 1) return "Tener al menos un hijo a cargo";
    return `Tener ${value} o más hijos a cargo`;
  }
  return `${prettyPath(path)} ≥ ${formatNumberOrEuro(path, value)}`;
}

function humanizeGt(path: string, value: number): string {
  if (path === "disability_pct") return `Tener un grado de discapacidad > ${value}%`;
  if (path === "income_base") return `Base liquidable estimada > ${formatEuro(value)}`;
  return `${prettyPath(path)} > ${formatNumberOrEuro(path, value)}`;
}

function humanizeLte(path: string, value: number): string {
  if (path === "income_base") return `Base liquidable estimada ≤ ${formatEuro(value)}`;
  if (path === "disability_pct") return `Grado de discapacidad ≤ ${value}%`;
  return `${prettyPath(path)} no debe superar ${formatNumberOrEuro(path, value)}`;
}

function humanizeLt(path: string, value: number): string {
  if (path === "income_base") return `Base liquidable estimada < ${formatEuro(value)}`;
  return `${prettyPath(path)} < ${formatNumberOrEuro(path, value)}`;
}

function humanizeBetween(path: string, range: [number, number]): string {
  const [min, max] = range;
  if (path === "income_base") {
    return `Base liquidable entre ${formatEuro(min)} y ${formatEuro(max)}`;
  }
  if (path === "disability_pct") {
    return `Grado de discapacidad entre ${min}% y ${max}%`;
  }
  return `${prettyPath(path)} entre ${formatNumberOrEuro(path, min)} y ${formatNumberOrEuro(path, max)}`;
}

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

const PATH_LABELS: Record<string, string> = {
  ccaa: "Comunidad autónoma",
  birth_date: "Fecha de nacimiento",
  civil_status: "Estado civil",
  declaration_mode: "Modalidad de declaración",
  monoparental: "Familia monoparental",
  large_family: "Familia numerosa",
  "housing.type": "Régimen de vivienda",
  "housing.is_habitual": "Vivienda habitual",
  "housing.monthly_rent_eur": "Renta mensual",
  disability_pct: "Grado de discapacidad",
  income_base: "Base liquidable",
  "kids.length": "Número de hijos",
  small_municipality: "Municipio pequeño",
};

function prettyPath(path: string): string {
  return PATH_LABELS[path] ?? path;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  return String(v);
}

function formatEuro(n: number): string {
  return `${n.toLocaleString("es-ES")} €`;
}

function formatNumberOrEuro(path: string, n: number): string {
  if (path === "income_base" || path.endsWith("_eur")) return formatEuro(n);
  if (path === "disability_pct") return `${n}%`;
  return String(n);
}
