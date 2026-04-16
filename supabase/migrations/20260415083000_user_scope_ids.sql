-- Helper: devuelve los scope_ids sobre los que el usuario tiene un permiso.
-- Útil para listar (p. ej.) todos los departamentos en los que el usuario
-- puede crear notificaciones fiscales.

SET search_path = public;

CREATE FUNCTION user_scope_ids(
  uid uuid,
  perm text,
  p_scope_type permission_scope_type
) RETURNS TABLE(scope_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT pr.scope_id
  FROM profile_roles pr
  JOIN role_permissions rp ON rp.role_id = pr.role_id
  WHERE pr.profile_id = uid
    AND pr.scope_type = p_scope_type
    AND rp.permission_code = perm
    AND pr.scope_id IS NOT NULL
  UNION
  SELECT DISTINCT pp.scope_id
  FROM profile_permissions pp
  WHERE pp.profile_id = uid
    AND pp.scope_type = p_scope_type
    AND pp.permission_code = perm
    AND pp.scope_id IS NOT NULL;
$$;
