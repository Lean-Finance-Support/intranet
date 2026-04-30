-- Renombrar columna microtechnician_id → supervisor_id en client_apartados.
-- La migración original fue editada a posteriori en el fichero pero en dev
-- ya estaba aplicada en BD con el nombre antiguo y necesitaba el rename.
-- En proyectos nuevos (p. ej. prod) la tabla nace ya con supervisor_id,
-- así que el rename solo se ejecuta si la columna vieja todavía existe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'documentation'
      AND table_name   = 'client_apartados'
      AND column_name  = 'microtechnician_id'
  ) THEN
    ALTER TABLE documentation.client_apartados
      RENAME COLUMN microtechnician_id TO supervisor_id;
  END IF;
END $$;
