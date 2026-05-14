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
  /**
   * Servicio padre que desbloquea las secciones "Modelos fiscales" y
   * "Dashboard fiscal" para el cliente.
   */
  TAX_ACCOUNTING_ADVICE: "asesoramiento-fiscal-y-contable",
  /**
   * Servicio "Declaración de la renta" (modelo 100). Habilita el feature
   * card en el tab "Informes / Formularios" de la ficha del cliente, con
   * la gestión de DNIs autorizados y el link público del formulario.
   */
  DECLARACION_RENTA: "declaracion-renta",
} as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[keyof typeof SERVICE_SLUGS];

// Slugs referenciados desde código (gates de sidebar, OAuth dashboard, etc.).
// La UI del catálogo bloquea editar el slug de estos servicios.
export const LOAD_BEARING_SERVICE_SLUGS: ReadonlySet<string> = new Set([
  SERVICE_SLUGS.TAX_ACCOUNTING_ADVICE,
  SERVICE_SLUGS.DECLARACION_RENTA,
]);

export interface ServiceCatalogItem extends Service {
  department_ids: string[];
  department_names: string[];
  company_count: number;
  is_load_bearing: boolean;
}
