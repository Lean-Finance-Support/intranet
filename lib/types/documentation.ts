// Tipos serializables para la feature "Documentación por cliente".
// Coinciden con el schema "documentation" definido en
// supabase/migrations/20260428100000_documentation_schema.sql.

export type ApartadoStatus = "pendiente" | "enviado" | "validado" | "rechazado";

// Tipo del apartado: 'file' = el cliente sube archivos (caso por defecto).
// 'form' = el cliente rellena un formulario estructurado (sin archivos), cuya
// shape concreta depende del `slug` del apartado y vive en
// `client_apartados.form_response` (JSONB).
export type ApartadoKind = "file" | "form";

// Slugs reconocidos para apartados kind='form'. Cada slug mapea a:
//   · un componente React específico en components/documentation/forms/<slug>.tsx
//   · una shape de form_response (ver FormResponseBySlug abajo)
//   · una función de validación en el server action (submitFormApartado)
export type FormApartadoSlug = "enisa-credentials" | "competidores";

// ───── Shapes de form_response por slug ─────

export interface EnisaFormResponse {
  user: string;
  // Texto serializado del cifrado AES-256-GCM (ver lib/crypto/enisa.ts).
  // Nunca se devuelve al cliente; solo lo descifra el admin vía server action.
  password_encrypted: string;
}

export interface CompetidorEntry {
  comercial: string;
  fiscal: string;
  cif: string;
}

export interface CompetidoresFormResponse {
  entries: CompetidorEntry[];
}

export type FormResponseBySlug = {
  "enisa-credentials": EnisaFormResponse;
  competidores: CompetidoresFormResponse;
};

// ───────── Catálogo (templates) ─────────

export interface BlockTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  apartados: ApartadoTemplate[];
}

export interface ApartadoTemplate {
  id: string;
  block_id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_global: boolean;
  kind: ApartadoKind;
  // Slug estable. Null para apartados kind='file' (no se mapean a componente
  // específico). NOT NULL para kind='form'.
  slug: string | null;
  // Solo aplica si is_global=true. Cuando true, el apartado se sugiere como
  // opcional por defecto en el wizard de onboarding y al asignar bloques.
  // Para apartados con dpto la opcionalidad va en `departments[].is_optional`.
  is_optional_global?: boolean;
  department_ids: string[];
  // Per-dept optionality. department_ids es la proyección "plana" para
  // consumidores que sólo necesitan saber a qué deptos pertenece el apartado;
  // departments tiene además el flag is_optional por dpto. Se mantienen ambos
  // para compatibilidad — los loaders del catálogo y del onboarding pueblan
  // ambos; otros loaders (asignación múltiple, doc por cliente) sólo pueblan
  // department_ids y dejan departments/tag_ids vacíos.
  departments?: ApartadoDepartmentLink[];
  tag_ids?: string[];
  templates: ApartadoTemplateFile[];
  // Slug de la plantilla de email asociada (catálogo en
  // lib/documentation/email-templates.ts). Si está presente, el flujo de
  // Asignación múltiple ofrecerá disparar ese email al asignar el apartado.
  email_template_slug: string | null;
}

export interface ApartadoDepartmentLink {
  department_id: string;
  is_optional: boolean;
}

export interface DocumentationTag {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface ApartadoTemplateFile {
  id: string;
  apartado_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  storage_path: string;
}

// ───────── Instancias por cliente ─────────

export interface ApartadoFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
  deleted_at: string | null;
  storage_path: string;
}

export interface ApartadoComment {
  id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface ApartadoStatusHistoryEntry {
  id: string;
  from_status: ApartadoStatus | null;
  to_status: ApartadoStatus;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  reason: string | null;
}

export interface ClientApartado {
  id: string;
  client_block_id: string;
  apartado_id: string;
  name: string;
  description: string | null;
  display_order: number;
  status: ApartadoStatus;
  is_global: boolean;
  is_optional: boolean;
  kind: ApartadoKind;
  slug: string | null;
  department_ids: string[];
  supervisors: ApartadoSupervisor[];
  templates: ApartadoTemplateFile[];
  validated_at: string | null;
  validated_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  last_rejection_reason: string | null;
  files: ApartadoFile[];
  comments: ApartadoComment[];
  history: ApartadoStatusHistoryEntry[];
  // Payload del cliente para apartados kind='form'. Para ENISA, password viene
  // ya cifrada — el descifrado se hace bajo demanda en server action.
  form_response: unknown;
}

export interface ClientBlock {
  id: string;
  company_id: string;
  block_id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  apartados: ClientApartado[];
}

export interface ClientDocumentation {
  blocks: ClientBlock[];
  // Stats globales sobre apartados validados / total. Excluye los marcados como
  // opcionales (is_optional=true): el cliente puede subirlos pero no cuentan
  // para el progreso.
  total_apartados: number;
  validated_apartados: number;
  // Última entrada de documentation.client_reminder_log para esta empresa.
  // Solo se rellena en el loader admin; en cliente se omite.
  last_reminder?: {
    sent_at: string;
    sent_by_name: string | null;
  } | null;
}

// ───────── Para selectors (supervisor) ─────────

export interface DepartmentMember {
  id: string;
  full_name: string | null;
  email: string;
  department_id: string;
  department_name: string;
}

// Supervisor asignado a un client_apartado (proyección de la view
// documentation.apartado_supervisors_v + profile + dept)
export interface ApartadoSupervisor {
  id: string; // profile_id
  full_name: string | null;
  email: string;
  department_id: string | null;
  department_name: string | null;
}
