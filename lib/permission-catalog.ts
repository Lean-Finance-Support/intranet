/**
 * Catálogo legible de los permisos grantables del sistema (modelo v2).
 *
 * Se usa en "Mi equipo" para mostrar capacidades delegables y en el drawer de
 * gestión de permisos (qué se puede otorgar y en qué scope).
 *
 * Solo los permisos con is_grantable=true participan del modelo N1/N2/N3.
 * Los demás (member_of_department, read_dept_service, write_assigned_company)
 * se obtienen exclusivamente vía rol y no aparecen aquí.
 */

export type PermissionScopeType =
  | "none"
  | "department"
  | "company"
  | "service"
  | "company_service";

export interface PermissionMeta {
  code: string;
  label: string;
  description: string;
  scopeType: PermissionScopeType;
  /** Texto usado para prefijo del scope en la UI (ej. "en {scope}"). */
  scopeLabel: string;
  /** Si true, participa del modelo N1/N2/N3 (aparece en el drawer de añadir permiso). */
  isGrantable: boolean;
}

// Single source of truth para metadata de permisos en UI.
export const PERMISSION_CATALOG: PermissionMeta[] = [
  // --- No grantables (se obtienen vía rol) ---
  {
    code: "member_of_department",
    label: "Pertenece al departamento. Puede ser elegido como técnico",
    description: "Marca al empleado como miembro del departamento.",
    scopeType: "department",
    scopeLabel: "en el departamento",
    isGrantable: false,
  },
  {
    code: "read_dept_service",
    label: "Puede consultar los servicios del departamento",
    description: "Leer empresas y servicios del departamento.",
    scopeType: "department",
    scopeLabel: "en el departamento",
    isGrantable: false,
  },
  {
    code: "write_dept_service",
    label: "Puede operar sobre los servicios del departamento",
    description:
      "Tocar cualquier empresa × servicio del departamento: asignar técnicos, contratar servicios, crear notificaciones, validar envíos, etc.",
    scopeType: "department",
    scopeLabel: "en el departamento",
    isGrantable: false,
  },
  {
    code: "write_assigned_company",
    label: "Operar sobre empresa asignada",
    description: "Tocar la empresa × servicio en la que el técnico está asignado.",
    scopeType: "company_service",
    scopeLabel: "en su empresa asignada",
    isGrantable: false,
  },
  {
    code: "manage_dept_membership",
    label: "Gestiona los miembros del departamento",
    description: "Añadir y quitar miembros, operadores y observadores del departamento.",
    scopeType: "department",
    scopeLabel: "en el departamento",
    isGrantable: false,
  },

  // --- Grantables (delegables N1/N2/N3) ---
  {
    code: "edit_company_info",
    label: "Editar datos de empresas",
    description: "Modificar nombre comercial, NIF, dirección, etc.",
    scopeType: "none",
    scopeLabel: "a nivel global",
    isGrantable: true,
  },
  {
    code: "manage_bank_accounts",
    label: "Gestionar cuentas bancarias",
    description: "Añadir, editar o quitar cuentas bancarias de empresas.",
    scopeType: "none",
    scopeLabel: "a nivel global",
    isGrantable: true,
  },
  {
    code: "create_company",
    label: "Crear empresas",
    description: "Dar de alta empresas nuevas.",
    scopeType: "none",
    scopeLabel: "a nivel global",
    isGrantable: true,
  },
  {
    code: "delete_company",
    label: "Eliminar empresas",
    description: "Desactivar (soft-delete) empresas.",
    scopeType: "none",
    scopeLabel: "a nivel global",
    isGrantable: true,
  },
  {
    code: "manage_client_accounts",
    label: "Gestionar cuentas cliente",
    description: "Crear, editar y desvincular cuentas de clientes.",
    scopeType: "none",
    scopeLabel: "a nivel global",
    isGrantable: true,
  },
];

/** Vista filtrada: solo los permisos que participan en el modelo N1/N2/N3. */
export const GRANTABLE_PERMISSIONS: PermissionMeta[] = PERMISSION_CATALOG.filter(
  (p) => p.isGrantable
);

export function getPermissionMeta(code: string): PermissionMeta | undefined {
  return PERMISSION_CATALOG.find((p) => p.code === code);
}

export function getGrantablePermission(code: string): PermissionMeta | undefined {
  const meta = getPermissionMeta(code);
  return meta?.isGrantable ? meta : undefined;
}

export function permLabel(code: string): string {
  return getPermissionMeta(code)?.label ?? code;
}

export function permDescription(code: string): string | undefined {
  return getPermissionMeta(code)?.description;
}

export function levelBadgeLabel(level: 1 | 2 | 3): string {
  return `N${level}`;
}

export function levelDescription(level: 1 | 2 | 3): string {
  if (level === 1) return "Puede usar el permiso";
  if (level === 2) return "Puede usar + otorgar a otros";
  return "Puede usar + otorgar + habilitar a delegadores";
}
