-- Función que consolida las "delegaciones efectivas" del usuario: por cada
-- permiso grantable con nivel >= 2, devuelve el nivel máximo que tiene
-- (tomando el MAX entre profile_permissions directos y los heredados vía
-- profile_roles).
--
-- Antes `getCurrentUserDelegations` solo leía profile_permissions, así que
-- alguien con Backoffice N2 no veía los 3 perms como delegables individualmente.

SET search_path = public;

CREATE OR REPLACE FUNCTION current_user_delegations(uid uuid)
RETURNS TABLE(
  permission_code text,
  scope_type permission_scope_type,
  scope_id uuid,
  grant_level smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.permission_code,
    t.scope_type,
    t.scope_id,
    MAX(t.lvl)::smallint AS grant_level
  FROM (
    -- Grants directos
    SELECT pp.permission_code, pp.scope_type, pp.scope_id, pp.grant_level AS lvl
    FROM profile_permissions pp
    JOIN permissions p ON p.code = pp.permission_code
    WHERE pp.profile_id = uid
      AND p.is_grantable = true
      AND pp.grant_level >= 2

    UNION ALL

    -- Grants vía rol: si el perm es global se registra siempre con scope 'none';
    -- si es dept-scoped, hereda el scope del role assignment.
    SELECT
      rp.permission_code,
      CASE WHEN p.scope_type = 'none' THEN 'none'::permission_scope_type ELSE pr.scope_type END,
      CASE WHEN p.scope_type = 'none' THEN NULL ELSE pr.scope_id END,
      pr.grant_level AS lvl
    FROM profile_roles pr
    JOIN role_permissions rp ON rp.role_id = pr.role_id
    JOIN permissions p ON p.code = rp.permission_code
    WHERE pr.profile_id = uid
      AND p.is_grantable = true
      AND pr.grant_level >= 2
  ) t
  GROUP BY t.permission_code, t.scope_type, t.scope_id;
$$;
