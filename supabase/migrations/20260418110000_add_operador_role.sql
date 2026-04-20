-- Añade el rol "Operador" como tercera vía de gestión cross-dept.
--
--  - Miembro   → read (+ pertenencia)
--  - Observador→ read (sin pertenencia; no elegible como técnico)
--  - Operador  → read + write (sin pertenencia; no elegible como técnico)
--  - Chief     → read + write + pertenencia (solo SQL)
--
-- Operador lo asignan los chiefs desde la UI (misma política que Miembro/Observador:
-- quien tiene write_dept_service en ese dept).

SET search_path = public;

INSERT INTO roles (name, description, is_system)
VALUES ('Operador', 'Opera sobre un departamento sin pertenecer a él ni ser elegible como técnico', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN (VALUES
  ('read_dept_service'),
  ('write_dept_service')
) AS p(code)
WHERE r.name = 'Operador'
ON CONFLICT DO NOTHING;

-- Actualizar las RLS de profile_roles para que Operador también esté permitido
-- bajo la misma regla que Miembro/Observador: requiere `manage_dept_membership`
-- (que solo tiene el rol Chief).

DROP POLICY IF EXISTS "roles insert miembro_observador" ON profile_roles;
DROP POLICY IF EXISTS "roles delete miembro_observador" ON profile_roles;
DROP POLICY IF EXISTS "roles insert dept_membership" ON profile_roles;
DROP POLICY IF EXISTS "roles delete dept_membership" ON profile_roles;

CREATE POLICY "roles insert dept_membership" ON profile_roles
  FOR INSERT
  WITH CHECK (
    scope_type = 'department'
    AND role_id IN (
      SELECT id FROM roles WHERE name IN ('Miembro de departamento', 'Observador', 'Operador')
    )
    AND has_permission(auth.uid(), 'manage_dept_membership', 'department', scope_id)
  );

CREATE POLICY "roles delete dept_membership" ON profile_roles
  FOR DELETE
  USING (
    scope_type = 'department'
    AND role_id IN (
      SELECT id FROM roles WHERE name IN ('Miembro de departamento', 'Observador', 'Operador')
    )
    AND has_permission(auth.uid(), 'manage_dept_membership', 'department', scope_id)
  );
