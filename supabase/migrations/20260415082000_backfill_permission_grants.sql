-- Backfill de grants desde las tablas heredadas:
--   profile_departments   -> rol "Miembro de departamento"
--   department_chiefs     -> rol "Chief" (incluye pertenencia, no hace falta doble grant)
--   company_technicians   -> rol "Técnico" + pertenencia al dept del servicio
--   profiles.role='superadmin' -> rol "Chief" en cada departamento existente
--
-- No se toca profiles.role todavía (el enum mantiene 'superadmin' hasta la fase final).
-- No se eliminan las tablas legacy (department_chiefs, company_technicians,
-- profile_departments) — se retiran en una fase posterior, cuando los consumidores
-- dejen de leerlas.

SET search_path = public;

--
-- 1. Miembro de departamento desde profile_departments.
--    Saltamos filas donde ya vaya a caer un Chief (el rol Chief incluye la pertenencia).
--
INSERT INTO profile_roles (profile_id, role_id, scope_type, scope_id)
SELECT
  pd.profile_id,
  (SELECT id FROM roles WHERE name = 'Miembro de departamento'),
  'department'::permission_scope_type,
  pd.department_id
FROM profile_departments pd
WHERE NOT EXISTS (
  SELECT 1 FROM department_chiefs dc
  WHERE dc.profile_id = pd.profile_id AND dc.department_id = pd.department_id
)
ON CONFLICT DO NOTHING;

--
-- 2. Chief desde department_chiefs.
--
INSERT INTO profile_roles (profile_id, role_id, scope_type, scope_id)
SELECT
  dc.profile_id,
  (SELECT id FROM roles WHERE name = 'Chief'),
  'department'::permission_scope_type,
  dc.department_id
FROM department_chiefs dc
ON CONFLICT DO NOTHING;

--
-- 3. Técnico desde company_technicians. scope_id = company_services.id.
--    company_technicians se asocia por (company_id, service_id); buscamos la
--    fila correspondiente en company_services. Si un technician apunta a un
--    (company, service) que no está en company_services, se salta (LEFT JOIN + filter).
--
INSERT INTO profile_roles (profile_id, role_id, scope_type, scope_id)
SELECT
  ct.technician_id,
  (SELECT id FROM roles WHERE name = 'Técnico'),
  'company_service'::permission_scope_type,
  cs.id
FROM company_technicians ct
JOIN company_services cs
  ON cs.company_id = ct.company_id AND cs.service_id = ct.service_id
ON CONFLICT DO NOTHING;

--
-- 4. Pertenencia al departamento del servicio para cada técnico que aún no la tenga.
--    Los técnicos deben poder leer el contexto del departamento al que pertenece su servicio.
--
INSERT INTO profile_roles (profile_id, role_id, scope_type, scope_id)
SELECT DISTINCT
  ct.technician_id,
  (SELECT id FROM roles WHERE name = 'Miembro de departamento'),
  'department'::permission_scope_type,
  ds.department_id
FROM company_technicians ct
JOIN department_services ds ON ds.service_id = ct.service_id
WHERE NOT EXISTS (
  -- ya tiene Miembro de departamento en ese dept
  SELECT 1 FROM profile_roles pr
  WHERE pr.profile_id = ct.technician_id
    AND pr.scope_type = 'department'
    AND pr.scope_id = ds.department_id
    AND pr.role_id = (SELECT id FROM roles WHERE name = 'Miembro de departamento')
)
AND NOT EXISTS (
  -- o ya tiene Chief en ese dept (que ya incluye pertenencia)
  SELECT 1 FROM profile_roles pr
  WHERE pr.profile_id = ct.technician_id
    AND pr.scope_type = 'department'
    AND pr.scope_id = ds.department_id
    AND pr.role_id = (SELECT id FROM roles WHERE name = 'Chief')
)
ON CONFLICT DO NOTHING;

--
-- 5. Superadmins actuales -> Chief en cada departamento.
--    (El enum sigue conservando 'superadmin'; se retira en fase posterior.)
--
INSERT INTO profile_roles (profile_id, role_id, scope_type, scope_id)
SELECT
  p.id,
  (SELECT id FROM roles WHERE name = 'Chief'),
  'department'::permission_scope_type,
  d.id
FROM profiles p
CROSS JOIN departments d
WHERE p.role = 'superadmin'
ON CONFLICT DO NOTHING;
