-- Sistema de permisos y roles para empleados (Fase 1: schema + función + seed)
-- Ver /Users/mariopantoja/.claude/plans/glittery-percolating-anchor.md

SET search_path = public;

--
-- Enum de tipos de scope
--
CREATE TYPE permission_scope_type AS ENUM (
  'none',
  'department',
  'company',
  'service',
  'company_service'
);

--
-- Tabla de permisos (catálogo)
--
CREATE TABLE permissions (
  code text PRIMARY KEY,
  description text NOT NULL,
  scope_type permission_scope_type NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now()
);

--
-- Tabla de roles (agrupaciones de permisos)
--
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

--
-- Permisos incluidos en un rol
--
CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

--
-- Roles asignados a un empleado (con scope)
--
CREATE TABLE profile_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  scope_type permission_scope_type NOT NULL DEFAULT 'none',
  scope_id uuid,
  scope_service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_roles_unique UNIQUE NULLS NOT DISTINCT
    (profile_id, role_id, scope_type, scope_id, scope_service_id)
);

CREATE INDEX idx_profile_roles_profile ON profile_roles(profile_id);
CREATE INDEX idx_profile_roles_scope ON profile_roles(scope_type, scope_id);

--
-- Permisos sueltos otorgados directamente a un empleado
--
CREATE TABLE profile_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  scope_type permission_scope_type NOT NULL DEFAULT 'none',
  scope_id uuid,
  scope_service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_permissions_unique UNIQUE NULLS NOT DISTINCT
    (profile_id, permission_code, scope_type, scope_id, scope_service_id)
);

CREATE INDEX idx_profile_permissions_profile ON profile_permissions(profile_id);

--
-- Función central de comprobación de permisos
-- Matchea scope exacto; un permiso global (scope_type='none') ignora los argumentos de scope.
--
CREATE FUNCTION has_permission(
  uid uuid,
  perm text,
  p_scope_type permission_scope_type DEFAULT 'none',
  p_scope_id uuid DEFAULT NULL,
  p_scope_service_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- grant directo
    SELECT 1
    FROM profile_permissions pp
    JOIN permissions p ON p.code = pp.permission_code
    WHERE pp.profile_id = uid
      AND pp.permission_code = perm
      AND (
        p.scope_type = 'none'
        OR (
          pp.scope_type = p_scope_type
          AND pp.scope_id IS NOT DISTINCT FROM p_scope_id
          AND pp.scope_service_id IS NOT DISTINCT FROM p_scope_service_id
        )
      )
  )
  OR EXISTS (
    -- grant vía rol
    SELECT 1
    FROM profile_roles pr
    JOIN role_permissions rp ON rp.role_id = pr.role_id
    JOIN permissions p ON p.code = rp.permission_code
    WHERE pr.profile_id = uid
      AND rp.permission_code = perm
      AND (
        p.scope_type = 'none'
        OR (
          pr.scope_type = p.scope_type
          AND pr.scope_id IS NOT DISTINCT FROM p_scope_id
          AND pr.scope_service_id IS NOT DISTINCT FROM p_scope_service_id
          AND p_scope_type = p.scope_type
        )
      )
  );
$$;

--
-- RLS (mínima): solo admins pueden leer/escribir la configuración de permisos.
-- La l\u00f3gica fina vendr\u00e1 en fases posteriores.
--
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read permissions" ON permissions
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "admins write permissions" ON permissions
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "admins read roles" ON roles
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "admins write roles" ON roles
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "admins read role_permissions" ON role_permissions
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "admins write role_permissions" ON role_permissions
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "users read own profile_roles" ON profile_roles
  FOR SELECT USING (profile_id = auth.uid() OR is_admin(auth.uid()));
CREATE POLICY "admins write profile_roles" ON profile_roles
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "users read own profile_permissions" ON profile_permissions
  FOR SELECT USING (profile_id = auth.uid() OR is_admin(auth.uid()));
CREATE POLICY "admins write profile_permissions" ON profile_permissions
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

--
-- Seed: catálogo de permisos
--
INSERT INTO permissions (code, description, scope_type) VALUES
  ('member_of_department',     'Pertenece al departamento',                    'department'),
  ('view_department_companies','Ver todas las empresas del departamento',      'department'),
  ('view_assigned_company',    'Ver empresa asignada como técnico en un servicio', 'company_service'),
  ('view_tax_notifications',   'Ver notificaciones fiscales del departamento', 'department'),
  ('view_enisa_submissions',   'Ver presentaciones ENISA del departamento',    'department'),
  ('assign_technician',        'Asignar técnico a empresa+servicio',           'department'),
  ('add_company_service',      'Añadir servicio a una empresa',                'department'),
  ('create_tax_notification',  'Crear notificaciones fiscales',                'department'),
  ('review_enisa_submission',  'Validar/rechazar presentaciones ENISA',        'department'),
  ('edit_company_info',        'Editar datos de empresa (nombre, NIF, etc.)', 'none'),
  ('manage_bank_accounts',     'Gestionar cuentas bancarias de empresas',      'none'),
  ('create_company',           'Crear empresas nuevas',                        'none'),
  ('manage_users',             'Gestionar usuarios, roles y permisos',         'none');

--
-- Seed: roles de sistema
--
INSERT INTO roles (name, description, is_system) VALUES
  ('Miembro de departamento', 'Acceso de lectura básico a un departamento', true),
  ('Chief',                   'Responsable de un departamento: lectura + operaciones', true),
  ('Técnico',                 'Técnico asignado a una empresa en un servicio concreto', true);

--
-- Seed: composición de roles
--
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN (VALUES
  ('member_of_department'),
  ('view_department_companies'),
  ('view_tax_notifications'),
  ('view_enisa_submissions')
) AS p(code)
WHERE r.name = 'Miembro de departamento';

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN (VALUES
  -- incluye todo lo de "Miembro de departamento"
  ('member_of_department'),
  ('view_department_companies'),
  ('view_tax_notifications'),
  ('view_enisa_submissions'),
  -- + operaciones de chief
  ('assign_technician'),
  ('add_company_service'),
  ('create_tax_notification'),
  ('review_enisa_submission')
) AS p(code)
WHERE r.name = 'Chief';

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'view_assigned_company'
FROM roles r
WHERE r.name = 'Técnico';
