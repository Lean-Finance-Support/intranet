-- Modelo 303: solicitud de aplazamiento por parte del cliente.
--
-- Cambios aditivos (nullables o con DEFAULT seguro) para no romper el código
-- actualmente desplegado en producción.
--
-- 1) tax_entries.deferment_allowed
--    Checkbox del asesor: "Incluir posibilidad de aplazamiento" para esta
--    entrada. Solo tiene efecto en la UI cuando el modelo es 303 y entry_type
--    = 'pagar', pero la columna es genérica para poder extenderse a otros
--    modelos en el futuro.
ALTER TABLE public.tax_entries
  ADD COLUMN IF NOT EXISTS deferment_allowed boolean NOT NULL DEFAULT false;

-- 2) tax_client_responses: datos del aplazamiento solicitado por el cliente.
--    num_installments y first_payment_date son obligatorios cuando
--    deferment_requested = true (validado por CHECK más abajo).
ALTER TABLE public.tax_client_responses
  ADD COLUMN IF NOT EXISTS deferment_requested boolean NOT NULL DEFAULT false;

ALTER TABLE public.tax_client_responses
  ADD COLUMN IF NOT EXISTS deferment_num_installments smallint;

ALTER TABLE public.tax_client_responses
  ADD COLUMN IF NOT EXISTS deferment_first_payment_date date;

-- Coherencia: si se solicita aplazamiento, num_installments debe estar
-- entre 1 y 12 y first_payment_date no puede ser NULL. Si no se solicita,
-- ambos campos deben ser NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tax_client_responses_deferment_chk'
  ) THEN
    ALTER TABLE public.tax_client_responses
      ADD CONSTRAINT tax_client_responses_deferment_chk CHECK (
        (deferment_requested = false
          AND deferment_num_installments IS NULL
          AND deferment_first_payment_date IS NULL)
        OR
        (deferment_requested = true
          AND deferment_num_installments BETWEEN 1 AND 12
          AND deferment_first_payment_date IS NOT NULL)
      );
  END IF;
END$$;
