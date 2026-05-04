-- Permite asociar a cada apartado del catálogo una plantilla de email
-- "transaccional" identificada por slug. Cuando el apartado se asigna a un
-- cliente desde el flujo de Asignación múltiple, si tiene plantilla
-- asociada se ofrece enviar ese email a la empresa. Las plantillas en sí
-- (HTML/copy) viven en código (lib/documentation/email-templates.ts y
-- supabase/functions/_shared/email-templates/), no en BD: solo guardamos el
-- slug. Si una plantilla deja de existir en código, la asociación queda
-- "huérfana" y la UI la trata como si no hubiera plantilla. La columna
-- carece de check de valores permitidos a propósito (la lista vive en TS).

ALTER TABLE documentation.apartados
  ADD COLUMN IF NOT EXISTS email_template_slug text;

-- Asociar plantilla "dashboard-holded-contrato" al apartado "Tratamiento de
-- datos" del bloque "Contratos" (creado por la migración 20260429113843).
UPDATE documentation.apartados
   SET email_template_slug = 'dashboard-holded-contrato'
 WHERE name = 'Tratamiento de datos'
   AND block_id = (SELECT id FROM documentation.blocks WHERE slug = 'contratos');
