-- Niveles de delegación para el sistema de permisos.
--
-- Introduce un modelo de 3 niveles (grant_level) sobre profile_permissions:
--   N1 = tiene el permiso; no puede delegar
--   N2 = tiene el permiso + puede otorgar N1 a otros
--   N3 = tiene el permiso + puede otorgar N1 y N2 a otros (NO puede crear otro N3)
--
-- Solo se aplica a los permisos marcados como is_grantable. Los no-grantable
-- (lectura, pertenencia) siguen gestionándose vía profile_roles sin niveles.
--
-- N3 se bootstrapa exclusivamente por SQL (esta migración + futuras).

SET search_path = public;

-- =============================================================================
-- 1. Metadata en permissions: qué permisos aceptan el modelo de niveles
-- =============================================================================

ALTER TABLE permissions
  ADD COLUMN is_grantable boolean NOT NULL DEFAULT false;

UPDATE permissions
SET is_grantable = true
WHERE code IN (
  'assign_technician',
  'add_company_service',
  'create_tax_notification',
  'review_enisa_submission',
  'edit_company_info',
  'manage_bank_accounts',
  'create_company',
  'delete_company',
  'manage_users',
  'manage_client_accounts'
);

-- =============================================================================
-- 2. grant_level en profile_permissions
-- =============================================================================

ALTER TABLE profile_permissions
  ADD COLUMN grant_level smallint NOT NULL DEFAULT 1
    CHECK (grant_level BETWEEN 1 AND 3);

-- El UNIQUE existente ya cubre (profile_id, permission_code, scope_type, scope_id).
-- Un mismo grant se almacena con un solo nivel (se hace UPSERT al promover).

-- =============================================================================
-- 3. user_grant_level: nivel efectivo de un usuario sobre (permiso, scope)
-- =============================================================================
--   0 = no tiene el permiso
--   1 = lo tiene vía rol o vía profile_permissions con grant_level=1
--   2 = lo tiene vía profile_permissions con grant_level=2
--   3 = lo tiene vía profile_permissions con grant_level=3
-- Si coexisten varias fuentes, prevalece el máximo.

CREATE FUNCTION user_grant_level(
  uid uuid,
  perm text,
  p_scope_type permission_scope_type DEFAULT 'none',
  p_scope_id uuid DEFAULT NULL
) RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(MAX(lvl), 0)::smallint
  FROM (
    -- Desde profile_permissions (nivel explícito)
    SELECT pp.grant_level AS lvl
    FROM profile_permissions pp
    JOIN permissions p ON p.code = pp.permission_code
    WHERE pp.profile_id = uid
      AND pp.permission_code = perm
      AND (
        p.scope_type = 'none'
        OR (
          pp.scope_type = p_scope_type
          AND pp.scope_id IS NOT DISTINCT FROM p_scope_id
        )
      )
    UNION ALL
    -- Desde profile_roles (rol → nivel implícito 1)
    SELECT 1 AS lvl
    FROM profile_roles pr
    JOIN role_permissions rp ON rp.role_id = pr.role_id
    JOIN permissions p ON p.code = rp.permission_code
    WHERE pr.profile_id = uid
      AND rp.permission_code = perm
      AND (
        p.scope_type = 'none'
        OR (
          pr.scope_type = p.scope_type
          AND p_scope_type = p.scope_type
          AND pr.scope_id IS NOT DISTINCT FROM p_scope_id
        )
      )
  ) t;
$$;

-- =============================================================================
-- 4. can_grant_to_level: ¿puede el usuario otorgar (perm, scope) al nivel X?
-- =============================================================================
-- Regla: user_grant_level(...) >= target_level + 1
--   N2 (2) → puede otorgar N1 (2 >= 2) ✓
--   N3 (3) → puede otorgar N1 (3 >= 2) ✓ y N2 (3 >= 3) ✓
--   Nadie puede otorgar N3 (nadie tiene level 4)

CREATE FUNCTION can_grant_to_level(
  uid uuid,
  perm text,
  p_scope_type permission_scope_type DEFAULT 'none',
  p_scope_id uuid DEFAULT NULL,
  target_level smallint DEFAULT 1
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT target_level BETWEEN 1 AND 2
    AND user_grant_level(uid, perm, p_scope_type, p_scope_id) >= target_level + 1;
$$;

-- =============================================================================
-- 5. RLS de profile_permissions: permitir escrituras basadas en can_grant
-- =============================================================================
-- - Las escrituras con grant_level=3 quedan bloqueadas por RLS (solo SQL/migrations).
-- - manage_users puede insertar/actualizar/borrar N1 y N2 sobre cualquier perm/scope.
-- - Cualquier usuario con can_grant_to_level adecuado puede hacerlo para ese grant.

DROP POLICY IF EXISTS "manage_users write profile_permissions" ON profile_permissions;

CREATE POLICY "grants insert profile_permissions" ON profile_permissions
  FOR INSERT
  WITH CHECK (
    grant_level IN (1, 2)
    AND (
      has_permission(auth.uid(), 'manage_users')
      OR can_grant_to_level(
        auth.uid(),
        permission_code,
        scope_type,
        scope_id,
        grant_level
      )
    )
  );

CREATE POLICY "grants update profile_permissions" ON profile_permissions
  FOR UPDATE
  USING (
    has_permission(auth.uid(), 'manage_users')
    OR can_grant_to_level(
      auth.uid(),
      permission_code,
      scope_type,
      scope_id,
      grant_level
    )
  )
  WITH CHECK (
    grant_level IN (1, 2)
    AND (
      has_permission(auth.uid(), 'manage_users')
      OR can_grant_to_level(
        auth.uid(),
        permission_code,
        scope_type,
        scope_id,
        grant_level
      )
    )
  );

CREATE POLICY "grants delete profile_permissions" ON profile_permissions
  FOR DELETE
  USING (
    has_permission(auth.uid(), 'manage_users')
    OR can_grant_to_level(
      auth.uid(),
      permission_code,
      scope_type,
      scope_id,
      grant_level
    )
  );

-- =============================================================================
-- 6. Lectura pública de profile_permissions / profile_roles para empleados
-- =============================================================================
-- Mi equipo muestra roles/capacidades de TODOS los empleados → cualquier admin
-- puede leer profile_permissions y profile_roles, no solo los suyos.

DROP POLICY IF EXISTS "users read own profile_permissions" ON profile_permissions;
DROP POLICY IF EXISTS "users read own profile_roles" ON profile_roles;

CREATE POLICY "admins read profile_permissions" ON profile_permissions
  FOR SELECT USING (is_admin(auth.uid()) OR profile_id = auth.uid());

CREATE POLICY "admins read profile_roles" ON profile_roles
  FOR SELECT USING (is_admin(auth.uid()) OR profile_id = auth.uid());

-- =============================================================================
-- 7. Bootstrap inicial: tech@leanfinance.es = N3 en todos los perms grantables
-- =============================================================================

DO $$
DECLARE
  tech_id uuid;
BEGIN
  SELECT id INTO tech_id FROM profiles WHERE email = 'tech@leanfinance.es' LIMIT 1;
  IF tech_id IS NULL THEN
    RAISE NOTICE 'tech@leanfinance.es profile no encontrado; saltando bootstrap N3';
    RETURN;
  END IF;

  -- Perms globales (scope_type='none')
  INSERT INTO profile_permissions (profile_id, permission_code, scope_type, scope_id, grant_level)
  SELECT tech_id, p.code, 'none', NULL, 3
  FROM permissions p
  WHERE p.is_grantable = true AND p.scope_type = 'none'
  ON CONFLICT ON CONSTRAINT profile_permissions_unique
    DO UPDATE SET grant_level = GREATEST(profile_permissions.grant_level, 3);

  -- Perms scope 'department' → una fila por departamento existente
  INSERT INTO profile_permissions (profile_id, permission_code, scope_type, scope_id, grant_level)
  SELECT tech_id, p.code, 'department', d.id, 3
  FROM permissions p
  CROSS JOIN departments d
  WHERE p.is_grantable = true AND p.scope_type = 'department'
  ON CONFLICT ON CONSTRAINT profile_permissions_unique
    DO UPDATE SET grant_level = GREATEST(profile_permissions.grant_level, 3);

  -- Perms scope 'company_service' → una fila por company_service activo
  -- (hoy no hay perms grantables con este scope, pero queda preparado)
  INSERT INTO profile_permissions (profile_id, permission_code, scope_type, scope_id, grant_level)
  SELECT tech_id, p.code, 'company_service', cs.id, 3
  FROM permissions p
  CROSS JOIN company_services cs
  WHERE p.is_grantable = true AND p.scope_type = 'company_service'
  ON CONFLICT ON CONSTRAINT profile_permissions_unique
    DO UPDATE SET grant_level = GREATEST(profile_permissions.grant_level, 3);
END $$;
