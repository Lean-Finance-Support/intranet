-- Fix: la migración v2 dropeó las policies SELECT de profile_roles y
-- profile_permissions y se olvidó de recrearlas. Sin policy SELECT:
--   - profile_roles: Mi equipo salía vacío para cualquier admin.
--   - profile_permissions: el flujo de grant no detectaba permisos ya
--     existentes y el INSERT fallaba contra el unique constraint.

SET search_path = public;

DROP POLICY IF EXISTS "admins read profile_roles" ON profile_roles;

CREATE POLICY "admins read profile_roles" ON profile_roles
  FOR SELECT USING (is_admin(auth.uid()) OR profile_id = auth.uid());

DROP POLICY IF EXISTS "admins read profile_permissions" ON profile_permissions;

CREATE POLICY "admins read profile_permissions" ON profile_permissions
  FOR SELECT USING (is_admin(auth.uid()) OR profile_id = auth.uid());
