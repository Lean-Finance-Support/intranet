-- Renombrar columna microtechnician_id → supervisor_id en client_apartados.
-- La migración original fue editada a posteriori en el fichero pero ya estaba
-- aplicada en BD con el nombre antiguo.
ALTER TABLE documentation.client_apartados
  RENAME COLUMN microtechnician_id TO supervisor_id;
