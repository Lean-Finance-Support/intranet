/**
 * Definición declarativa del paso 2 del formulario público (perfil universal).
 *
 * No depende de la BD — vive en código porque las preguntas son universales
 * y solo cambian con código. El form las renderiza dinámicamente y el motor
 * de reglas las consume a través de `RentaProfileResponse`.
 */

import { ALL_CCAA, CCAA_LABELS, type RentaProfileResponse } from "@/lib/types/renta";

export interface ProfileQuestion {
  key: keyof RentaProfileResponse | string;
  label: string;
  help_text?: string;
  kind: "ccaa-select" | "date" | "select" | "number" | "boolean" | "text" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  /** Sección lógica para agrupar visualmente. */
  section: "ubicacion" | "personal" | "familiar" | "vivienda" | "ingresos" | "notas";
}

export const PROFILE_SECTIONS: { key: ProfileQuestion["section"]; title: string; description?: string }[] = [
  { key: "ubicacion", title: "Domicilio fiscal", description: "Tu comunidad autónoma de residencia habitual determina qué deducciones se aplican." },
  { key: "personal", title: "Datos personales" },
  { key: "familiar", title: "Situación familiar" },
  { key: "vivienda", title: "Vivienda habitual" },
  { key: "ingresos", title: "Ingresos" },
  { key: "notas", title: "Notas para tu asesor" },
];

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  // -------- Ubicación --------
  {
    key: "ccaa",
    label: "Comunidad autónoma de residencia",
    kind: "ccaa-select",
    required: true,
    section: "ubicacion",
    options: ALL_CCAA.map((c) => ({ value: c, label: CCAA_LABELS[c] })),
  },
  {
    key: "small_municipality",
    label: "¿Resides en un municipio pequeño o en riesgo de despoblación?",
    help_text: "Pueblos de menos de 5.000 habitantes. Activa deducciones específicas en muchas CCAA.",
    kind: "boolean",
    section: "ubicacion",
  },

  // -------- Personales --------
  {
    key: "birth_date",
    label: "Fecha de nacimiento",
    kind: "date",
    required: true,
    section: "personal",
  },
  {
    key: "disability_pct",
    label: "Grado de discapacidad reconocido (%)",
    help_text: "0 si no tienes discapacidad reconocida. A partir del 33% se activan deducciones específicas.",
    kind: "number",
    min: 0,
    max: 100,
    required: true,
    section: "personal",
  },

  // -------- Familiar --------
  {
    key: "civil_status",
    label: "Estado civil",
    kind: "select",
    required: true,
    section: "familiar",
    options: [
      { value: "soltero", label: "Soltero/a" },
      { value: "casado", label: "Casado/a" },
      { value: "pareja_de_hecho", label: "Pareja de hecho" },
      { value: "viudo", label: "Viudo/a" },
      { value: "separado", label: "Separado/a" },
      { value: "divorciado", label: "Divorciado/a" },
    ],
  },
  {
    key: "declaration_mode",
    label: "Modalidad de declaración",
    kind: "select",
    required: false,
    section: "familiar",
    options: [
      { value: "individual", label: "Individual" },
      { value: "conjunta", label: "Conjunta (en pareja)" },
    ],
  },
  {
    key: "monoparental",
    label: "¿Formas una familia monoparental?",
    help_text: "Padre o madre con hijos a cargo sin convivencia con otro progenitor.",
    kind: "boolean",
    section: "familiar",
  },
  {
    key: "large_family",
    label: "¿Tienes reconocida la condición de familia numerosa?",
    kind: "select",
    required: false,
    section: "familiar",
    options: [
      { value: "no", label: "No" },
      { value: "general", label: "Sí — categoría general" },
      { value: "especial", label: "Sí — categoría especial" },
    ],
  },
  // `kids` se gestiona como tabla repetible en el componente del form.

  // -------- Vivienda --------
  // `housing` también es un compuesto, lo maneja el componente.

  // -------- Ingresos --------
  {
    key: "income_base",
    label: "Base liquidable estimada (€)",
    help_text: "Suma aproximada de tus ingresos anuales gravables. Si no lo sabes, déjalo en blanco — tu asesor lo completará.",
    kind: "number",
    min: 0,
    required: false,
    section: "ingresos",
  },

  // -------- Notas --------
  {
    key: "notes",
    label: "Comentarios o circunstancias adicionales",
    kind: "textarea",
    required: false,
    section: "notas",
    help_text: "Cualquier dato que tu asesor deba conocer (cambios de domicilio, fallecimientos, etc.).",
  },
];

/** Valida que `profile_response` tiene los campos required. */
export function validateProfile(profile: Partial<RentaProfileResponse>): string[] {
  const errors: string[] = [];
  for (const q of PROFILE_QUESTIONS) {
    if (!q.required) continue;
    const v = (profile as Record<string, unknown>)[q.key as string];
    if (v === undefined || v === null || v === "") {
      errors.push(`Falta el campo: ${q.label}`);
    }
  }
  // Vivienda obligatoria.
  if (!profile.housing || !("type" in profile.housing)) {
    errors.push("Falta el campo: Vivienda habitual");
  }
  return errors;
}
