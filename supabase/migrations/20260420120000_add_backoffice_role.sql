-- Rol "Backoffice": agrupa los 3 permisos globales de gestión de clientes.
--
-- Se otorga desde la UI del pop-up de empleado, en el drawer "Roles".
-- La RLS exige que el actor tenga user_grant_level >= 2 en los 3 permisos
-- que componen el rol (coherente con el modelo de delegación N1/N2/N3).

SET search_path = public;

-- =============================================================================
-- 1. Crear el rol y vincular permisos
-- =============================================================================

INSERT INTO roles (name, description, is_system)
VALUES (
  'Backoffice',
  'Gestión cross-empresa de datos de empresa, cuentas cliente y cuentas bancarias',
  true
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN (VALUES
  ('edit_company_info'),
  ('manage_client_accounts'),
  ('manage_bank_accounts')
) AS p(code)
WHERE r.name = 'Backoffice'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 2. RLS para asignación del rol (INSERT/DELETE en profile_roles scope=none)
-- =============================================================================
-- Solo permitimos INSERT/DELETE del rol Backoffice a quien tenga user_grant_level
-- >= 2 sobre los 3 permisos que lo componen. Por defecto, eso lo cumple cualquiera
-- con N3 en los 3 (bootstrap manual por SQL) o N2 en los 3 (delegado).

DROP POLICY IF EXISTS "roles insert backoffice" ON profile_roles;
DROP POLICY IF EXISTS "roles delete backoffice" ON profile_roles;

CREATE POLICY "roles insert backoffice" ON profile_roles
  FOR INSERT
  WITH CHECK (
    scope_type = 'none'
    AND role_id = (SELECT id FROM roles WHERE name = 'Backoffice')
    AND user_grant_level(auth.uid(), 'edit_company_info', 'none', NULL) >= 2
    AND user_grant_level(auth.uid(), 'manage_client_accounts', 'none', NULL) >= 2
    AND user_grant_level(auth.uid(), 'manage_bank_accounts', 'none', NULL) >= 2
  );

CREATE POLICY "roles delete backoffice" ON profile_roles
  FOR DELETE
  USING (
    scope_type = 'none'
    AND role_id = (SELECT id FROM roles WHERE name = 'Backoffice')
    AND user_grant_level(auth.uid(), 'edit_company_info', 'none', NULL) >= 2
    AND user_grant_level(auth.uid(), 'manage_client_accounts', 'none', NULL) >= 2
    AND user_grant_level(auth.uid(), 'manage_bank_accounts', 'none', NULL) >= 2
  );
