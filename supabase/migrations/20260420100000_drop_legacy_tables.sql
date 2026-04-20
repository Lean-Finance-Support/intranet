-- Drop de las tres tablas legacy sustituidas por profile_roles.
--
-- Tras el refactor v2:
--   - profile_departments  → rol "Miembro de departamento" (scope=department)
--   - department_chiefs    → rol "Chief"                    (scope=department)
--   - company_technicians  → rol "Técnico"                  (scope=company_service)
--
-- Todo el código (app + edge functions) ya lee desde profile_roles. Las
-- tablas se pueden eliminar sin pérdida de información funcional.

SET search_path = public;

DROP TABLE IF EXISTS public.company_technicians CASCADE;
DROP TABLE IF EXISTS public.department_chiefs CASCADE;
DROP TABLE IF EXISTS public.profile_departments CASCADE;
