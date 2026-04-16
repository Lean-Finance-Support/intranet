-- Eliminamos las columnas `phone` y `address` de companies. Nunca se llegaron a
-- usar de verdad: ningún flujo de negocio depende de ellas y los formularios
-- correspondientes (admin + portal cliente) se eliminan en este mismo cambio.

ALTER TABLE public.companies DROP COLUMN IF EXISTS phone;
ALTER TABLE public.companies DROP COLUMN IF EXISTS address;
