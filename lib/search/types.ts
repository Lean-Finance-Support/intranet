export type SearchSpace = "admin" | "client";

export type SearchIconName =
  | "home"
  | "document"
  | "users"
  | "building"
  | "book"
  | "chart"
  | "swap";

export type SearchGroupId = "pages" | "clients" | "client-sections" | "company-switch";

export interface SearchableCompany {
  id: string;
  legal_name: string;
  company_name: string | null;
  has_dashboard_service: boolean;
  has_tax_models_service: boolean;
}

export interface SearchContext {
  space: SearchSpace;
  linkPrefix: string;
  role: "admin" | "client";
  /** Admin: services activos en sus departamentos. Client: services activos de su empresa. */
  hasTaxModels: boolean;
  /** Solo aplica al espacio cliente. */
  hasDashboard: boolean;
  /** Empresas visibles para búsqueda. Admin = todas las que ve. Client = sus propias empresas. */
  companies: SearchableCompany[];
  /** Empresa activa en el portal cliente (cookie x-active-company-id). */
  activeCompanyId: string | null;
}

export interface SearchDestination {
  id: string;
  group: SearchGroupId;
  label: string;
  sublabel?: string;
  href: string;
  icon: SearchIconName;
  keywords: string[];
}

export interface SearchPageEntry {
  id: string;
  /** Solo se muestra en el espacio indicado. */
  space: SearchSpace;
  label: string;
  /** Ruta relativa al linkPrefix (ej: `/clientes`). El href final = `${prefix}${path}`. */
  path: string;
  icon: SearchIconName;
  keywords: string[];
  gate?: (ctx: SearchContext) => boolean;
}

export interface SearchResultGroup {
  id: SearchGroupId;
  label: string;
  items: SearchDestination[];
}
