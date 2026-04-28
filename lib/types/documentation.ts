// Tipos serializables para la feature "Documentación por cliente".
// Coinciden con el schema "documentation" definido en
// supabase/migrations/20260428100000_documentation_schema.sql.

export type ApartadoStatus = "pendiente" | "enviado" | "validado" | "rechazado";

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
  department_ids: string[];
  templates: ApartadoTemplateFile[];
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
  // Stats globales sobre apartados validados / total (excluye rechazados como "no listos")
  total_apartados: number;
  validated_apartados: number;
}

// ───────── Para selectors (supervisor) ─────────

export interface DepartmentMember {
  id: string;
  full_name: string | null;
  email: string;
  department_id: string;
  department_name: string;
}

// Supervisor asignado a un client_apartado (proyección de
// documentation.client_apartado_supervisors + profile + dept)
export interface ApartadoSupervisor {
  id: string; // profile_id
  full_name: string | null;
  email: string;
  department_id: string | null;
  department_name: string | null;
}
