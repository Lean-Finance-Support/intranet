-- Limpieza de columnas legacy sin uso:
--   * companies.is_demo — sustituido por eliminación directa de empresas demo.
--   * departments.chief_id — sustituido hace tiempo por department_chiefs (y ahora por profile_roles).

SET search_path = public;

-- 1. Borrar cualquier empresa demo superviviente antes de quitar la columna.
DELETE FROM companies WHERE is_demo = true;

-- 2. Drop columnas
ALTER TABLE companies DROP COLUMN is_demo;
ALTER TABLE departments DROP COLUMN chief_id;
