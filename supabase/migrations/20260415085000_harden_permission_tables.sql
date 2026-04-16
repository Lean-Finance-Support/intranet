-- Blinda las tablas del sistema de permisos: solo alguien con el permiso
-- `manage_users` puede escribirlas. Evita que cualquier admin pueda
-- auto-asignarse roles o permisos.
--
-- Lectura queda igual (admins pueden ver la configuración, cada usuario puede
-- ver sus propios grants).

SET search_path = public;

DROP POLICY IF EXISTS "admins write permissions" ON permissions;
DROP POLICY IF EXISTS "admins write roles" ON roles;
DROP POLICY IF EXISTS "admins write role_permissions" ON role_permissions;
DROP POLICY IF EXISTS "admins write profile_roles" ON profile_roles;
DROP POLICY IF EXISTS "admins write profile_permissions" ON profile_permissions;

CREATE POLICY "manage_users write permissions" ON permissions
  FOR ALL USING (has_permission(auth.uid(), 'manage_users'))
       WITH CHECK (has_permission(auth.uid(), 'manage_users'));

CREATE POLICY "manage_users write roles" ON roles
  FOR ALL USING (has_permission(auth.uid(), 'manage_users'))
       WITH CHECK (has_permission(auth.uid(), 'manage_users'));

CREATE POLICY "manage_users write role_permissions" ON role_permissions
  FOR ALL USING (has_permission(auth.uid(), 'manage_users'))
       WITH CHECK (has_permission(auth.uid(), 'manage_users'));

CREATE POLICY "manage_users write profile_roles" ON profile_roles
  FOR ALL USING (has_permission(auth.uid(), 'manage_users'))
       WITH CHECK (has_permission(auth.uid(), 'manage_users'));

CREATE POLICY "manage_users write profile_permissions" ON profile_permissions
  FOR ALL USING (has_permission(auth.uid(), 'manage_users'))
       WITH CHECK (has_permission(auth.uid(), 'manage_users'));
