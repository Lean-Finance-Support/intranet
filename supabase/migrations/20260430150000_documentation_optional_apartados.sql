-- Apartados opcionales por cliente.
--
-- Un apartado se puede marcar como "opcional" en una asignación concreta a un
-- cliente (`client_apartados.is_optional`). El comportamiento en la UI es el
-- mismo que un apartado normal (subir archivos, validar, comentarios, etc.);
-- la única diferencia es que NO computa en las barras de progreso (global y
-- por bloque). El cómputo se hace en el loader del server action, no en la
-- propia BD.
--
-- Se marca/desmarca al asignar el apartado al cliente (modal de añadir
-- bloque/apartado) o desde la vista de detalle. No se conserva en el catálogo:
-- cada cliente tiene su propia decisión.

ALTER TABLE documentation.client_apartados
  ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_documentation_client_apartados_optional
  ON documentation.client_apartados(client_block_id, is_optional);
