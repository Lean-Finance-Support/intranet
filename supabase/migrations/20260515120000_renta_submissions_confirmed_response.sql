-- Declaración de la renta: extra_fields de las deducciones confirmadas.
--
-- `deductions_response` guarda los extra_fields tal y como los aportó el
-- contribuyente (registro inmutable de lo que él declaró). Pero el asesor
-- necesita poder corregir esos datos y rellenarlos para deducciones que él
-- mismo añade o confirma desde el panel.
--
-- `confirmed_deductions_response` es ese mapa editable por el asesor:
-- deduction_id → payload de extra_fields. Arranca como copia de
-- `deductions_response` (las que el contribuyente marcó "Sí") y el asesor lo
-- refina mientras la submission no esté en estado 'revisada'.

alter table renta.submissions
  add column if not exists confirmed_deductions_response jsonb not null default '{}'::jsonb;

comment on column renta.submissions.confirmed_deductions_response is
  'Mapa deduction_id → extra_fields editado por el asesor para las deducciones confirmadas. Independiente de deductions_response (lo que aportó el contribuyente).';

-- Backfill: las submissions existentes parten de lo que aportó el contribuyente.
update renta.submissions
  set confirmed_deductions_response = deductions_response
  where confirmed_deductions_response = '{}'::jsonb
    and deductions_response <> '{}'::jsonb;
