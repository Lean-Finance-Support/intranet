-- Sustituye el campo único `summary` de renta.deductions por dos campos
-- distintos para la UI del wizard:
--
--   - what_covers (text)   — descripción de qué gastos/situaciones cubre.
--   - requirements (jsonb) — array de strings con la checklist de requisitos
--                            legibles para que el contribuyente decida si le
--                            aplica.
--
-- El heurístico que partía `summary` en frases en tiempo de render fallaba en
-- muchas deducciones (textos heterogéneos entre 15 CCAA × 349 entradas).
-- Modelar los dos conceptos en el catálogo permite que cada deducción tenga
-- exactamente la presentación correcta.
--
-- El seed regenerado en 20260514110100 vuelve a hacer TRUNCATE+INSERT con los
-- nuevos campos. La columna `summary` se elimina aquí.

ALTER TABLE renta.deductions
  ADD COLUMN IF NOT EXISTS what_covers text,
  ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE renta.deductions DROP COLUMN IF EXISTS summary;

COMMENT ON COLUMN renta.deductions.what_covers IS
  'Descripción legible de qué gastos o situaciones cubre la deducción. Render en la tarjeta "Qué cubre" del wizard.';
COMMENT ON COLUMN renta.deductions.requirements IS
  'Array JSON de strings con los requisitos concretos. Render como checklist con bullets en la tarjeta "Requisitos" del wizard.';
