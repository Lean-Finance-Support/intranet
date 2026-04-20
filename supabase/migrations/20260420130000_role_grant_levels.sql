-- Añade grant_level a profile_roles y actualiza user_grant_level para
-- considerarlo. Así Backoffice (y cualquier futuro rol global) puede asignarse
-- a N1 (solo usa) o N2 (usa + puede delegar el rol/permisos).
--
-- Para los roles scoped a dept (Miembro, Chief, Observador, Operador, Técnico)
-- el level se queda siempre en 1 — su delegación se gobierna por
-- manage_dept_membership, no por niveles.

SET search_path = public;

-- =============================================================================
-- 1. Añadir columna grant_level (default 1, valor existente queda = 1)
-- =============================================================================

ALTER TABLE profile_roles
  ADD COLUMN IF NOT EXISTS grant_level smallint NOT NULL DEFAULT 1
    CHECK (grant_level BETWEEN 1 AND 3);

-- =============================================================================
-- 2. Actualizar user_grant_level para usar pr.grant_level
-- =============================================================================

CREATE OR REPLACE FUNCTION user_grant_level(
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
    -- Desde profile_roles (nivel del role assignment)
    SELECT pr.grant_level AS lvl
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
