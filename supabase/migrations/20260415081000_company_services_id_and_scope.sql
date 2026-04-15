-- Unificar scope compuesto: profile_roles/profile_permissions dejan de usar
-- scope_service_id; ahora scope_id referencia directamente company_services.id
-- cuando scope_type='company_service'.
--
-- (company_services ya tiene id propio en dev y prod, no hace falta tocarlo.)

SET search_path = public;

--
-- 1. Quitar scope_service_id de los grants
--
ALTER TABLE profile_roles
  DROP CONSTRAINT profile_roles_unique;

ALTER TABLE profile_roles
  DROP COLUMN scope_service_id;

ALTER TABLE profile_roles
  ADD CONSTRAINT profile_roles_unique UNIQUE NULLS NOT DISTINCT
    (profile_id, role_id, scope_type, scope_id);

ALTER TABLE profile_permissions
  DROP CONSTRAINT profile_permissions_unique;

ALTER TABLE profile_permissions
  DROP COLUMN scope_service_id;

ALTER TABLE profile_permissions
  ADD CONSTRAINT profile_permissions_unique UNIQUE NULLS NOT DISTINCT
    (profile_id, permission_code, scope_type, scope_id);

--
-- 2. Reescribir has_permission sin el quinto argumento
--
DROP FUNCTION has_permission(uuid, text, permission_scope_type, uuid, uuid);

CREATE FUNCTION has_permission(
  uid uuid,
  perm text,
  p_scope_type permission_scope_type DEFAULT 'none',
  p_scope_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
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
        )
      )
  )
  OR EXISTS (
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
          AND p_scope_type = p.scope_type
          AND pr.scope_id IS NOT DISTINCT FROM p_scope_id
        )
      )
  );
$$;
