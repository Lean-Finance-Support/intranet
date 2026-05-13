export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CompanyService {
  id: string;
  company_id: string;
  service_id: string;
  is_active: boolean;
  contracted_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyServiceWithDetails extends CompanyService {
  service: Service;
}

export interface Department {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentService {
  id: string;
  department_id: string;
  service_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentServiceWithDetails extends DepartmentService {
  service: Service;
}

export const SERVICE_SLUGS = {
  /** Servicio padre que desbloquea la sección "Modelos fiscales" para el cliente. */
  TAX_ACCOUNTING_ADVICE: "asesoramiento-fiscal-y-contable",
  /** Servicio padre que desbloquea la sección "Dashboard fiscal" para el cliente. */
  EXTERNALIZED_ADMIN: "gestion-administrativa-externalizada",
} as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[keyof typeof SERVICE_SLUGS];

// Slugs referenciados desde código (gates de sidebar, OAuth dashboard, etc.).
// La UI del catálogo bloquea editar el slug de estos servicios.
export const LOAD_BEARING_SERVICE_SLUGS: ReadonlySet<string> = new Set([
  SERVICE_SLUGS.TAX_ACCOUNTING_ADVICE,
  SERVICE_SLUGS.EXTERNALIZED_ADMIN,
]);

export interface ServiceCatalogItem extends Service {
  department_ids: string[];
  department_names: string[];
  company_count: number;
  is_load_bearing: boolean;
}
