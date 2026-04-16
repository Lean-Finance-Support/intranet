-- Permiso para gestionar (crear, editar, desvincular) cuentas cliente asociadas a empresas
-- desde el portal de empleados. Scope global ("none"): quien lo tenga puede operar sobre
-- las cuentas de cualquier empresa.
--
-- Los permisos `create_company` y `edit_company_info` ya existían (sembrados en
-- 20260415080000_permissions_system.sql) y se aprovechan también desde la nueva UI.
--
-- No se asigna a ningún rol semilla; se otorga manualmente vía profile_permissions.

INSERT INTO permissions (code, description, scope_type) VALUES
  ('manage_client_accounts',
   'Crear, editar y desvincular cuentas cliente asociadas a empresas',
   'none')
ON CONFLICT (code) DO NOTHING;
