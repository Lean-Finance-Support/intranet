/**
 * Tipos del schema `renta` (Declaración de la renta).
 * Mantenidos en sync con `supabase/migrations/20260514110000_renta_schema.sql`.
 */

export type RentaInvitationStatus = "activa" | "revocada" | "expirada";
export type RentaSubmissionStatus = "pendiente" | "revisada";

export interface RentaInvitation {
  id: string;
  company_id: string;
  token: string;
  status: RentaInvitationStatus;
  expires_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

export interface RentaAuthorizedFiler {
  id: string;
  company_id: string;
  dni: string;
  full_name: string;
  email: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentaAuthorizedFilerWithUsage extends RentaAuthorizedFiler {
  /** Si ya envió una submission para la invitation activa. */
  has_submission: boolean;
}

/** Respuestas universales del perfil (paso 2 del form). */
export interface RentaProfileResponse {
  ccaa: CCAACode;
  /** ISO date (YYYY-MM-DD). */
  birth_date: string;
  civil_status: "soltero" | "casado" | "pareja_de_hecho" | "viudo" | "separado" | "divorciado";
  /** Modalidad de declaración: individual o conjunta. */
  declaration_mode?: "individual" | "conjunta";
  /** ¿Familia monoparental? (relevante para varias CCAA). */
  monoparental?: boolean;
  /** ¿Familia numerosa? (general / especial). */
  large_family?: "no" | "general" | "especial";
  kids: RentaKid[];
  housing: RentaHousing;
  /** Porcentaje de discapacidad del declarante (0 si no aplica). */
  disability_pct: number;
  /** Base liquidable general + del ahorro estimada (€). */
  income_base?: number;
  /** Municipio de residencia (nombre libre — para deducciones de despoblación). */
  municipality?: string;
  /** ¿Reside en municipio "pequeño" o "en riesgo de despoblación"? */
  small_municipality?: boolean;
  /** Campo libre para notas que el familiar quiera añadir al asesor. */
  notes?: string;
}

export interface RentaKid {
  id: string;
  /** ISO date. */
  birth_date: string;
  disability_pct: number;
  /** ¿Convive con el declarante? */
  cohabits: boolean;
}

export type RentaHousing =
  | { type: "alquiler"; monthly_rent_eur: number; start_date: string }
  | { type: "propiedad"; is_habitual: boolean; acquisition_date: string | null }
  | { type: "otro" };

export interface RentaSubmission {
  id: string;
  invitation_id: string;
  company_id: string;
  authorized_filer_id: string;
  full_name: string;
  dni: string;
  profile_response: RentaProfileResponse;
  /**
   * Mapa deduction_id → respuesta del usuario.
   * Para cada deducción aplicable según el rule engine, guardamos los
   * `extra_fields` que el contribuyente haya cumplimentado.
   */
  deductions_response: Record<string, Record<string, unknown>>;
  status: RentaSubmissionStatus;
  admin_notes: string | null;
  submitted_ip: string | null;
  submitted_user_agent: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Catálogo de deducciones autonómicas — data-driven, evaluado por rule-engine. */
export interface RentaDeduction {
  id: string;
  ccaa_code: CCAACode;
  title: string;
  /** Descripción de qué gastos/situaciones cubre. Render en tarjeta "Qué cubre". */
  what_covers: string | null;
  /** Array de strings con requisitos legibles. Render como checklist. */
  requirements: string[];
  legal_reference: string | null;
  eligibility_rule: RentaRule;
  extra_fields: RentaExtraField[];
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Campo adicional que se le pide al contribuyente si la deducción aplica. */
export interface RentaExtraField {
  key: string;
  label: string;
  kind: "text" | "number" | "date" | "boolean" | "select" | "textarea";
  required?: boolean;
  help_text?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

/**
 * AST de reglas de elegibilidad. Evaluado por `lib/renta/rule-engine.ts`.
 * Paths usan notación dot: "ccaa", "housing.type", "kids.length".
 */
export type RentaRule =
  | { all_of: RentaRule[] }
  | { any_of: RentaRule[] }
  | { not: RentaRule }
  | { op: "eq" | "neq"; path: string; value: unknown }
  | { op: "gt" | "gte" | "lt" | "lte"; path: string; value: number }
  | { op: "in"; path: string; value: unknown[] }
  | { op: "between"; path: string; value: [number, number] }
  | { op: "truthy"; path: string }
  | { op: "age_gte" | "age_lt"; path: string; value: number }
  | { op: "any_kid_age_lt" | "any_kid_age_between"; value: number | [number, number] };

/**
 * Códigos ISO 3166-2:ES de las CCAA con deducciones autonómicas IRPF estatal.
 *
 * NOTA: Navarra (ES-NC) y País Vasco (ES-PV) tienen régimen foral propio y NO
 * aparecen en el manual de deducciones autonómicas de la AEAT. Sus contribuyentes
 * declaran ante sus haciendas forales, no la AEAT. Por eso no están en este enum
 * ni en el catálogo de deducciones. Si en el futuro queremos que el formulario
 * sea accesible a residentes en estas comunidades, habrá que crear una rama
 * separada (form alternativo o nota explicativa) — no añadir códigos aquí
 * porque arrastra todo el motor de deducciones.
 */
export type CCAACode =
  | "ES-AN" // Andalucía
  | "ES-AR" // Aragón
  | "ES-AS" // Principado de Asturias
  | "ES-IB" // Illes Balears
  | "ES-CN" // Canarias
  | "ES-CB" // Cantabria
  | "ES-CM" // Castilla-La Mancha
  | "ES-CL" // Castilla y León
  | "ES-CT" // Cataluña
  | "ES-EX" // Extremadura
  | "ES-GA" // Galicia
  | "ES-MD" // Comunidad de Madrid
  | "ES-MC" // Región de Murcia
  | "ES-RI" // La Rioja
  | "ES-VC"; // Comunitat Valenciana

export const CCAA_LABELS: Record<CCAACode, string> = {
  "ES-AN": "Andalucía",
  "ES-AR": "Aragón",
  "ES-AS": "Principado de Asturias",
  "ES-IB": "Illes Balears",
  "ES-CN": "Canarias",
  "ES-CB": "Cantabria",
  "ES-CM": "Castilla-La Mancha",
  "ES-CL": "Castilla y León",
  "ES-CT": "Cataluña",
  "ES-EX": "Extremadura",
  "ES-GA": "Galicia",
  "ES-MD": "Comunidad de Madrid",
  "ES-MC": "Región de Murcia",
  "ES-RI": "La Rioja",
  "ES-VC": "Comunitat Valenciana",
};

export const ALL_CCAA: CCAACode[] = Object.keys(CCAA_LABELS) as CCAACode[];

/** Resultado de la server action `verifyDni`. */
export type VerifyDniResult =
  | { ok: true; full_name: string; authorized_filer_id: string }
  | { ok: false; reason: "invalid_token" | "expired_token" | "revoked_token" | "not_authorized" | "already_submitted" | "rate_limited" | "invalid_dni" };

/** Input que envía el form público al server action `submitRenta`. */
export interface SubmitRentaInput {
  token: string;
  authorized_filer_id: string;
  profile_response: RentaProfileResponse;
  deductions_response: Record<string, Record<string, unknown>>;
}

export type SubmitRentaResult =
  | { ok: true; submission_id: string }
  | { ok: false; reason: "invalid_token" | "expired_token" | "revoked_token" | "not_authorized" | "already_submitted" | "rate_limited" | "invalid_payload"; message?: string };
