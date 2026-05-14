-- Permiso atómico para gestionar el catálogo global de servicios desde
-- /admin/servicios. Patrón clon de manage_documentation_catalog:
-- transversal, scope global, grantable, sin pertenencia a roles
-- (se concede manualmente vía profile_permissions).

SET search_path = public;

INSERT INTO permissions (code, description, scope_type, is_grantable) VALUES
  ('manage_services_catalog',
   'Gestionar el catálogo global de servicios (crear, editar, archivar) y sus enlaces a departamentos',
   'none', true)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  scope_type  = EXCLUDED.scope_type,
  is_grantable = EXCLUDED.is_grantable;
