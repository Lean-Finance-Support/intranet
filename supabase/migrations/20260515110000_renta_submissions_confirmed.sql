-- Declaración de la renta: deducciones confirmadas por el asesor.
--
-- Tras revisar una submission, el asesor decide la lista definitiva de
-- deducciones a las que el contribuyente tiene derecho — incluye resolver las
-- que el contribuyente marcó como "No estoy seguro" y permite añadir/quitar
-- cualquier deducción del catálogo de su CCAA.
--
-- `confirmed_deductions` arranca con las deducciones que el contribuyente marcó
-- "Sí" (claves de `deductions_response`) como propuesta editable. El cliente
-- solo ve esta lista cuando la submission está en estado 'revisada'.

alter table renta.submissions
  add column if not exists confirmed_deductions text[] not null default '{}'::text[];

comment on column renta.submissions.confirmed_deductions is
  'IDs de deducciones confirmadas por el asesor — la lista definitiva visible para el cliente cuando status = revisada.';
