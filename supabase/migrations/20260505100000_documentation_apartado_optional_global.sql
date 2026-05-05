-- Permite marcar apartados globales (`is_global = true`) como opcionales por
-- defecto. La opcionalidad per-departamento ya vive en
-- `apartado_departments.is_optional` (migración 20260505000000); para globales
-- no hay fila pivote, así que añadimos la columna directamente sobre
-- `apartados`.
--
-- Semántica del flag en el wizard de onboarding:
--   - apartado.is_global=true  → si is_optional=true → opcional por defecto
--                                en la sugerencia inicial (admin puede tocar).
--   - apartado.is_global=false → este flag se ignora; la opcionalidad la
--                                resuelve apartado_departments.is_optional
--                                contra los deptos seleccionados.
--
-- Seeds: marcamos "Propuesta comercial" y "Tratamiento de datos" como
-- opcionales, ya que actualmente son los dos únicos globales y conceptualmente
-- son "nice to have" no bloqueantes para arrancar el servicio.

ALTER TABLE documentation.apartados
  ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;

UPDATE documentation.apartados
SET is_optional = true
WHERE is_global = true
  AND name IN ('Propuesta comercial', 'Tratamiento de datos');
