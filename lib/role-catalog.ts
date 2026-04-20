/**
 * Composición de los roles del sistema. Fuente de verdad en BD
 * (roles + role_permissions), duplicado aquí para UI (expansión de rol,
 * filtrado de perms cubiertos por un rol que el target ya tiene).
 *
 * Las etiquetas y descripciones de cada permiso viven en permission-catalog.ts.
 */

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  Backoffice: ["edit_company_info", "manage_client_accounts", "manage_bank_accounts"],
  "Miembro de departamento": ["member_of_department", "read_dept_service"],
  Chief: [
    "member_of_department",
    "read_dept_service",
    "write_dept_service",
    "manage_dept_membership",
  ],
  Operador: ["read_dept_service", "write_dept_service"],
  Observador: ["read_dept_service"],
  "Técnico": ["write_assigned_company"],
};

// Re-export para mantener la API del drawer/modal sin cambios.
export { permLabel } from "@/lib/permission-catalog";
