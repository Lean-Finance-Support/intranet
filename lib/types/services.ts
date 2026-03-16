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
  TAX_MODELS: "tax-models",
} as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[keyof typeof SERVICE_SLUGS];
