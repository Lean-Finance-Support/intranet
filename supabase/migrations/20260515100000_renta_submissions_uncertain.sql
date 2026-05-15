-- Declaración de la renta: deducciones marcadas como "No lo tengo claro".
--
-- El familiar/empleado que rellena el formulario público puede, además de
-- "Sí me aplica" / "No me aplica", responder "No estoy seguro" en cada
-- deducción autonómica. Esas deducciones no llevan extra_fields (no se
-- cumplimentan) — solo se registra que el contribuyente tiene dudas para que
-- el asesor las revise manualmente.
--
-- Guardamos los ids de deducción en un text[] aparte de `deductions_response`
-- (que sigue almacenando solo las marcadas "Sí" con sus campos).

alter table renta.submissions
  add column if not exists uncertain_deductions text[] not null default '{}'::text[];

comment on column renta.submissions.uncertain_deductions is
  'IDs de deducciones que el contribuyente marcó como "No estoy seguro". El asesor decide si aplican.';
