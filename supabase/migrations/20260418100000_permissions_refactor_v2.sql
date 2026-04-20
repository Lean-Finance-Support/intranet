-- Refactor completo del modelo de permisos.
--
-- Pasa de 15 verbos atómicos a 9 permisos semánticos (lectura/escritura por
-- depto + lectura/escritura por company_service). Elimina manage_users,
-- introduce rol Observador, reescribe las RLS sobre can_grant_to_level
-- y pone el servicio ENISA en standby.
--
-- Idempotente en el sentido de que intenta sobrevivir a una aplicación parcial:
-- usa IF EXISTS / ON CONFLICT donde tiene sentido.

SET search_path = public;

-- =============================================================================
-- 0. DROP de policies antiguas y propias (idempotente)
-- =============================================================================

-- Legacy (dependientes de manage_users)
DROP POLICY IF EXISTS "manage_users write permissions" ON permissions;
DROP POLICY IF EXISTS "manage_users write roles" ON roles;
DROP POLICY IF EXISTS "manage_users write role_permissions" ON role_permissions;
DROP POLICY IF EXISTS "manage_users write profile_roles" ON profile_roles;
DROP POLICY IF EXISTS "manage_users write profile_permissions" ON profile_permissions;

-- Propias (por si ya se aplicó la migración y la estamos reaplicando)
DROP POLICY IF EXISTS "grants insert profile_permissions" ON profile_permissions;
DROP POLICY IF EXISTS "grants update profile_permissions" ON profile_permissions;
DROP POLICY IF EXISTS "grants delete profile_permissions" ON profile_permissions;
DROP POLICY IF EXISTS "roles insert miembro_observador" ON profile_roles;
DROP POLICY IF EXISTS "roles delete miembro_observador" ON profile_roles;
DROP POLICY IF EXISTS "roles insert tecnico" ON profile_roles;
DROP POLICY IF EXISTS "roles delete tecnico" ON profile_roles;
DROP POLICY IF EXISTS "admins read profile_permissions" ON profile_permissions;
DROP POLICY IF EXISTS "admins read profile_roles" ON profile_roles;

-- =============================================================================
-- 1. Añadir nuevos permisos al catálogo
-- =============================================================================

-- write_dept_service NO es grantable: se otorga exclusivamente vía el rol
-- Operador (o Chief). Nada de N1/N2/N3 sobre este permiso desde UI.
-- manage_dept_membership tampoco es grantable: exclusivo del rol Chief.
INSERT INTO permissions (code, description, scope_type, is_grantable) VALUES
  ('read_dept_service',        'Ver empresas × servicios del departamento',    'department',       false),
  ('write_dept_service',       'Operar sobre cualquier empresa × servicio del departamento', 'department', false),
  ('write_assigned_company',   'Operar sobre su empresa × servicio asignado',  'company_service',  false),
  ('manage_dept_membership',   'Añadir/quitar miembros, operadores y observadores del departamento', 'department', false)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  scope_type = EXCLUDED.scope_type,
  is_grantable = EXCLUDED.is_grantable;

-- =============================================================================
-- 2. Reescribir role_permissions de los roles de sistema
-- =============================================================================

-- Limpiar composición actual para poder reinsertar sin duplicados
DELETE FROM role_permissions
WHERE role_id IN (SELECT id FROM roles WHERE name IN ('Miembro de departamento', 'Chief', 'Técnico'));

-- Miembro de departamento
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN (VALUES
  ('member_of_department'),
  ('read_dept_service')
) AS p(code)
WHERE r.name = 'Miembro de departamento';

-- Chief (único rol con manage_dept_membership)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN (VALUES
  ('member_of_department'),
  ('read_dept_service'),
  ('write_dept_service'),
  ('manage_dept_membership')
) AS p(code)
WHERE r.name = 'Chief';

-- Técnico
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'write_assigned_company'
FROM roles r
WHERE r.name = 'Técnico';

-- Observador (nuevo rol: solo read_dept_service, sin member_of_department)
INSERT INTO roles (name, description, is_system)
VALUES ('Observador', 'Ve un departamento sin pertenecer ni ser elegible como técnico', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'read_dept_service'
FROM roles r
WHERE r.name = 'Observador'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. Backfill de profile_roles desde tablas legacy
-- =============================================================================

-- 3a. profile_departments → Miembro de departamento (fuente histórica de membresía)
INSERT INTO profile_roles (profile_id, role_id, scope_type, scope_id)
SELECT DISTINCT
  pd.profile_id,
  (SELECT id FROM roles WHERE name = 'Miembro de departamento'),
  'department'::permission_scope_type,
  pd.department_id
FROM profile_departments pd
ON CONFLICT ON CONSTRAINT profile_roles_unique DO NOTHING;

-- 3b. department_chiefs → Chief (fuente histórica de jefatura)
INSERT INTO profile_roles (profile_id, role_id, scope_type, scope_id)
SELECT DISTINCT
  dc.profile_id,
  (SELECT id FROM roles WHERE name = 'Chief'),
  'department'::permission_scope_type,
  dc.department_id
FROM department_chiefs dc
ON CONFLICT ON CONSTRAINT profile_roles_unique DO NOTHING;

-- 3c. Todo Técnico debe tener Miembro en el dept del company_service asignado
INSERT INTO profile_roles (profile_id, role_id, scope_type, scope_id)
SELECT DISTINCT
  pr.profile_id,
  (SELECT id FROM roles WHERE name = 'Miembro de departamento'),
  'department'::permission_scope_type,
  ds.department_id
FROM profile_roles pr
JOIN roles r ON r.id = pr.role_id AND r.name = 'Técnico'
JOIN company_services cs ON cs.id = pr.scope_id
JOIN department_services ds ON ds.service_id = cs.service_id AND ds.is_active = true
WHERE pr.scope_type = 'company_service'
ON CONFLICT ON CONSTRAINT profile_roles_unique DO NOTHING;

-- =============================================================================
-- 4. Limpiar grants sueltos con permisos deprecados
-- =============================================================================

DELETE FROM profile_permissions
WHERE permission_code IN (
  'view_department_companies',
  'view_tax_notifications',
  'view_enisa_submissions',
  'view_assigned_company',
  'assign_technician',
  'add_company_service',
  'create_tax_notification',
  'review_enisa_submission',
  'manage_users'
);

-- =============================================================================
-- 5. Drop de permisos deprecados del catálogo (cascade limpia role_permissions residuales)
-- =============================================================================

DELETE FROM permissions WHERE code IN (
  'view_department_companies',
  'view_tax_notifications',
  'view_enisa_submissions',
  'view_assigned_company',
  'assign_technician',
  'add_company_service',
  'create_tax_notification',
  'review_enisa_submission',
  'manage_users'
);

-- =============================================================================
-- 6. Helper: dept del company_service
-- =============================================================================

CREATE OR REPLACE FUNCTION dept_of_company_service(cs_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ds.department_id
  FROM company_services cs
  JOIN department_services ds ON ds.service_id = cs.service_id AND ds.is_active = true
  WHERE cs.id = cs_id
  LIMIT 1;
$$;

-- =============================================================================
-- 7. RLS nueva para profile_roles (asignación desde UI por chiefs)
-- =============================================================================

-- SELECT: cualquier admin o el propio usuario
CREATE POLICY "admins read profile_roles" ON profile_roles
  FOR SELECT USING (is_admin(auth.uid()) OR profile_id = auth.uid());

CREATE POLICY "admins read profile_permissions" ON profile_permissions
  FOR SELECT USING (is_admin(auth.uid()) OR profile_id = auth.uid());

-- Miembro/Observador (scope=department): quien tiene manage_dept_membership (solo Chief)
-- Técnico (scope=company_service): quien tiene write_dept_service en el dept dueño del cs
--   (Chief y Operador, pero NO Miembro/Observador)
-- Chief: bloqueado (solo SQL)

CREATE POLICY "roles insert miembro_observador" ON profile_roles
  FOR INSERT
  WITH CHECK (
    scope_type = 'department'
    AND role_id IN (
      SELECT id FROM roles WHERE name IN ('Miembro de departamento', 'Observador')
    )
    AND has_permission(auth.uid(), 'manage_dept_membership', 'department', scope_id)
  );

CREATE POLICY "roles delete miembro_observador" ON profile_roles
  FOR DELETE
  USING (
    scope_type = 'department'
    AND role_id IN (
      SELECT id FROM roles WHERE name IN ('Miembro de departamento', 'Observador')
    )
    AND has_permission(auth.uid(), 'manage_dept_membership', 'department', scope_id)
  );

CREATE POLICY "roles insert tecnico" ON profile_roles
  FOR INSERT
  WITH CHECK (
    scope_type = 'company_service'
    AND role_id = (SELECT id FROM roles WHERE name = 'Técnico')
    AND has_permission(
      auth.uid(),
      'write_dept_service',
      'department',
      dept_of_company_service(scope_id)
    )
  );

CREATE POLICY "roles delete tecnico" ON profile_roles
  FOR DELETE
  USING (
    scope_type = 'company_service'
    AND role_id = (SELECT id FROM roles WHERE name = 'Técnico')
    AND has_permission(
      auth.uid(),
      'write_dept_service',
      'department',
      dept_of_company_service(scope_id)
    )
  );

-- =============================================================================
-- 8. RLS nueva para profile_permissions (solo can_grant_to_level, sin manage_users)
-- =============================================================================

CREATE POLICY "grants insert profile_permissions" ON profile_permissions
  FOR INSERT
  WITH CHECK (
    grant_level IN (1, 2)
    AND can_grant_to_level(
      auth.uid(),
      permission_code,
      scope_type,
      scope_id,
      grant_level
    )
  );

CREATE POLICY "grants update profile_permissions" ON profile_permissions
  FOR UPDATE
  USING (
    can_grant_to_level(
      auth.uid(),
      permission_code,
      scope_type,
      scope_id,
      grant_level
    )
  )
  WITH CHECK (
    grant_level IN (1, 2)
    AND can_grant_to_level(
      auth.uid(),
      permission_code,
      scope_type,
      scope_id,
      grant_level
    )
  );

CREATE POLICY "grants delete profile_permissions" ON profile_permissions
  FOR DELETE
  USING (
    can_grant_to_level(
      auth.uid(),
      permission_code,
      scope_type,
      scope_id,
      grant_level
    )
  );

-- =============================================================================
-- 9. ENISA en standby (is_active=false en service + department_services + company_services)
-- =============================================================================

UPDATE services
SET is_active = false, updated_at = COALESCE(updated_at, now())
WHERE slug = 'enisa-docs';

UPDATE department_services
SET is_active = false
WHERE service_id = (SELECT id FROM services WHERE slug = 'enisa-docs');

UPDATE company_services
SET is_active = false, updated_at = now()
WHERE service_id = (SELECT id FROM services WHERE slug = 'enisa-docs');
