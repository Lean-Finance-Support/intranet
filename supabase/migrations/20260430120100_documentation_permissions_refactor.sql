-- Refactor del modelo de permisos de la feature "Documentación por cliente":
--
--   1) manage_documentation_catalog y request_client_documentation pasan a
--      scope global ('none'). request_client_documentation sigue formando
--      parte del rol Chief; manage_documentation_catalog se quita del rol
--      Chief (es un permiso transversal y se otorgará por delegación).
--
--   2) Aparece un permiso global nuevo: validate_documentation. Permite
--      validar/rechazar cualquier apartado de cualquier cliente. Va al rol
--      Chief.
--
--   3) validate_client_documentation cambia su scope a 'client_apartado' y
--      pasa a otorgarse SIEMPRE vía el nuevo rol "Supervisor de apartado",
--      que es lo que sustituye a la antigua tabla
--      documentation.client_apartado_supervisors. Asignar un supervisor a un
--      apartado equivale a otorgarle ese rol con scope_id = client_apartado.id.
--
--   4) La tabla client_apartado_supervisors desaparece. Para preservar la
--      ergonomía de "lista de supervisores de este apartado" se publica una
--      view documentation.apartado_supervisors_v.

SET search_path = public;

-- =============================================================================
-- 1. Refactor del catálogo de permisos
-- =============================================================================

-- Quitar grants previos sobre validate_client_documentation antes de cambiar
-- el scope_type del permiso (los scopes ya no encajan con el nuevo modelo).
DELETE FROM profile_permissions WHERE permission_code = 'validate_client_documentation';
DELETE FROM role_permissions   WHERE permission_code = 'validate_client_documentation';

UPDATE permissions
   SET description = 'Gestionar el catálogo global de bloques y apartados de documentación',
       scope_type = 'none',
       is_grantable = true
 WHERE code = 'manage_documentation_catalog';

UPDATE permissions
   SET description = 'Añadir/quitar documentación a un cliente y asignar supervisores',
       scope_type = 'none',
       is_grantable = true
 WHERE code = 'request_client_documentation';

UPDATE permissions
   SET description = 'Validar/rechazar un apartado concreto como supervisor asignado',
       scope_type = 'client_apartado',
       is_grantable = false
 WHERE code = 'validate_client_documentation';

INSERT INTO permissions (code, description, scope_type, is_grantable) VALUES
  ('validate_documentation',
   'Validar/rechazar documentación de cualquier cliente',
   'none', false)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  scope_type  = EXCLUDED.scope_type,
  is_grantable = EXCLUDED.is_grantable;

-- =============================================================================
-- 2. Recomposición de los roles
-- =============================================================================

-- Limpiar el bloque de permisos de documentación del rol Chief para
-- reescribirlo de forma idempotente.
DELETE FROM role_permissions
 WHERE role_id = (SELECT id FROM roles WHERE name = 'Chief')
   AND permission_code IN (
     'manage_documentation_catalog',
     'request_client_documentation',
     'validate_client_documentation',
     'validate_documentation'
   );

-- Chief: request_client_documentation + validate_documentation.
-- (manage_documentation_catalog deja de ser de Chief.)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM roles r
  CROSS JOIN (VALUES
    ('request_client_documentation'),
    ('validate_documentation')
  ) AS p(code)
 WHERE r.name = 'Chief'
ON CONFLICT DO NOTHING;

-- Nuevo rol Supervisor de apartado.
INSERT INTO roles (name, description, is_system) VALUES
  ('Supervisor de apartado',
   'Supervisor asignado a un apartado de documentación de un cliente. Otorga validación sobre ese apartado.',
   true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'validate_client_documentation'
  FROM roles r
 WHERE r.name = 'Supervisor de apartado'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. Migración de datos: client_apartado_supervisors → profile_roles
-- =============================================================================

INSERT INTO profile_roles (profile_id, role_id, scope_type, scope_id)
SELECT DISTINCT
       cas.profile_id,
       (SELECT id FROM roles WHERE name = 'Supervisor de apartado'),
       'client_apartado'::permission_scope_type,
       cas.client_apartado_id
  FROM documentation.client_apartado_supervisors cas
ON CONFLICT ON CONSTRAINT profile_roles_unique DO NOTHING;

-- =============================================================================
-- 4. Drop de la tabla N:M (los datos ya viven en profile_roles)
-- =============================================================================

DROP TABLE IF EXISTS documentation.client_apartado_supervisors;

-- =============================================================================
-- 5. RLS para asignar/desasignar el rol Supervisor de apartado
--    Quien tiene request_client_documentation (global) puede gestionarlo.
-- =============================================================================

DROP POLICY IF EXISTS "roles insert supervisor_apartado" ON profile_roles;
DROP POLICY IF EXISTS "roles delete supervisor_apartado" ON profile_roles;

CREATE POLICY "roles insert supervisor_apartado" ON profile_roles
  FOR INSERT
  WITH CHECK (
    scope_type = 'client_apartado'
    AND role_id = (SELECT id FROM roles WHERE name = 'Supervisor de apartado')
    AND has_permission(auth.uid(), 'request_client_documentation')
  );

CREATE POLICY "roles delete supervisor_apartado" ON profile_roles
  FOR DELETE
  USING (
    scope_type = 'client_apartado'
    AND role_id = (SELECT id FROM roles WHERE name = 'Supervisor de apartado')
    AND has_permission(auth.uid(), 'request_client_documentation')
  );

-- =============================================================================
-- 6. View ergonómica: supervisores asignados a cada apartado
-- =============================================================================

CREATE OR REPLACE VIEW documentation.apartado_supervisors_v AS
SELECT
  pr.scope_id   AS client_apartado_id,
  pr.profile_id,
  pr.created_at AS assigned_at,
  prof.email    AS profile_email,
  prof.full_name AS profile_full_name
FROM public.profile_roles pr
JOIN public.roles    r    ON r.id = pr.role_id
JOIN public.profiles prof ON prof.id = pr.profile_id
WHERE r.name = 'Supervisor de apartado'
  AND pr.scope_type = 'client_apartado';

GRANT SELECT ON documentation.apartado_supervisors_v TO authenticated, service_role;

-- =============================================================================
-- 7. Bootstrap: tech@leanfinance.es como N3 en los nuevos permisos globales
--    grantables (manage_documentation_catalog, request_client_documentation).
--    validate_documentation no es grantable: se obtiene exclusivamente vía
--    rol Chief.
-- =============================================================================

DO $$
DECLARE
  tech_id uuid;
BEGIN
  SELECT id INTO tech_id FROM profiles WHERE email = 'tech@leanfinance.es' LIMIT 1;
  IF tech_id IS NULL THEN
    RAISE NOTICE 'tech@leanfinance.es no encontrado; saltando bootstrap N3';
    RETURN;
  END IF;

  INSERT INTO profile_permissions (profile_id, permission_code, scope_type, scope_id, grant_level)
  SELECT tech_id, p.code, 'none', NULL, 3
    FROM permissions p
   WHERE p.code IN ('manage_documentation_catalog', 'request_client_documentation')
     AND p.is_grantable = true
  ON CONFLICT ON CONSTRAINT profile_permissions_unique
    DO UPDATE SET grant_level = GREATEST(profile_permissions.grant_level, 3);
END $$;
