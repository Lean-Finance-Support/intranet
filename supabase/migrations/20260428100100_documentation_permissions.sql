-- Permisos del feature "Documentación por cliente":
--   - manage_documentation_catalog: editar el catálogo (bloques/apartados-template)
--   - request_client_documentation: añadir/quitar bloques y apartados a un cliente,
--                                   asignar supervisor
--   - validate_client_documentation: validar/rechazar apartados ya enviados
--
-- Todos con scope=department. Validar/rechazar también lo puede hacer el
-- supervisor asignado (auth se computa en server action mirando supervisor_id).

INSERT INTO public.permissions (code, description, scope_type, is_grantable) VALUES
  ('manage_documentation_catalog',
   'Gestionar el catálogo de bloques y apartados de documentación',
   'department', true),
  ('request_client_documentation',
   'Añadir/quitar documentación a un cliente y asignar supervisor',
   'department', true),
  ('validate_client_documentation',
   'Validar o rechazar apartados de documentación de cliente',
   'department', false)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  scope_type = EXCLUDED.scope_type,
  is_grantable = EXCLUDED.is_grantable;

-- Asignar los tres al rol Chief
INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.roles r
CROSS JOIN (VALUES
  ('manage_documentation_catalog'),
  ('request_client_documentation'),
  ('validate_client_documentation')
) AS p(code)
WHERE r.name = 'Chief'
ON CONFLICT DO NOTHING;
