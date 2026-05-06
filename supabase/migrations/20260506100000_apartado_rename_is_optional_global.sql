-- Renombra `documentation.apartados.is_optional` a `is_optional_global` para
-- que el nombre documente la semántica: solo aplica cuando `is_global = true`.
-- Para apartados no globales la opcionalidad vive en
-- `apartado_departments.is_optional` (resuelta per-dpto contra los deptos del
-- onboarding).
--
-- Además añade un CHECK que impone la invariante a nivel de BD: no puede
-- haber un apartado con `is_optional_global = true` que no sea global. Antes
-- la regla solo la aplicaba el código del wizard.

ALTER TABLE documentation.apartados
  RENAME COLUMN is_optional TO is_optional_global;

ALTER TABLE documentation.apartados
  ADD CONSTRAINT apartados_is_optional_global_requires_global
  CHECK (NOT is_optional_global OR is_global);
