-- Modelo de "matriz de documentación inicial" para el flujo de onboarding.
--
-- 1. is_optional pasa a ser per-departamento (apartado_departments.is_optional).
--    Un mismo apartado puede ser obligatorio para un dpto y opcional para otro.
--    Lo usa el wizard de onboarding para precalcular qué apartados van como
--    opcionales según los deptos seleccionados.
--
--    Resolución multi-dpto: si TODOS los deptos seleccionados marcan el
--    apartado como opcional → opcional. Basta uno mandatory para que sea
--    obligatorio. Esto se calcula en el server action, no aquí.
--
-- 2. Tags transversales en el catálogo (`documentation.tags` + pivote
--    `apartado_tags`). Los tags actúan como condiciones extra que activan
--    documentación: si un apartado tiene tags, se incluye en el onboarding
--    sólo si TODOS sus tags tienen su checkbox marcado en el wizard.
--    Tags semilla:
--      - 'cliente_no_viene_de_holded' → activa los apartados que en el Excel
--         original aparecían en rosa.
--      - 'solicita_alta_empresa' → activa los apartados específicos de alta
--         (p.ej. "Cuestionario si es alta de empresa").

-- =============================================================================
-- 1. is_optional per (apartado, department)
-- =============================================================================

ALTER TABLE documentation.apartado_departments
  ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;

-- =============================================================================
-- 2. Tags
-- =============================================================================

CREATE TABLE IF NOT EXISTS documentation.tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documentation.apartado_tags (
  apartado_id uuid NOT NULL REFERENCES documentation.apartados(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES documentation.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (apartado_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_documentation_apartado_tags_tag
  ON documentation.apartado_tags(tag_id);

ALTER TABLE documentation.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation.apartado_tags ENABLE ROW LEVEL SECURITY;

-- Lectura abierta (admin + cliente). Escritura via server actions con
-- requirePermission('manage_documentation_catalog').
CREATE POLICY admins_read_tags ON documentation.tags
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY clients_read_tags ON documentation.tags
  FOR SELECT USING (public.is_client(auth.uid()));

CREATE POLICY admins_read_apartado_tags ON documentation.apartado_tags
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY clients_read_apartado_tags ON documentation.apartado_tags
  FOR SELECT USING (public.is_client(auth.uid()));

-- =============================================================================
-- 3. Seeds — tags
-- =============================================================================

INSERT INTO documentation.tags (slug, name, description) VALUES
  ('cliente_no_viene_de_holded',
   'Cliente no viene de Holded',
   'Apartados extra que se piden cuando el cliente no está ya integrado con Holded.'),
  ('solicita_alta_empresa',
   'Solicita Alta de Empresa',
   'Apartados extra que se piden cuando el onboarding incluye alta de empresa.')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 4. Seeds — flags iniciales según matriz Excel
-- =============================================================================

-- 4a. Apartados opcionales por nombre (la opcionalidad se aplica a TODOS los
--     deptos del apartado — son apartados cuyo nombre ya indica "si está
--     disponible / si estuviese / si las hay").
DO $$
DECLARE
  optional_names text[] := ARRAY[
    'Captable, si estuviese disponible',
    'Pool bancario, si estuviese disponible.',
    'Escrituras posteriores, si las hay.',
    'Deck o presentación de la empresa, si está disponible.'
  ];
  ap_id uuid;
  n text;
BEGIN
  FOREACH n IN ARRAY optional_names LOOP
    SELECT id INTO ap_id FROM documentation.apartados WHERE name = n LIMIT 1;
    IF ap_id IS NOT NULL THEN
      UPDATE documentation.apartado_departments
      SET is_optional = true
      WHERE apartado_id = ap_id;
    END IF;
  END LOOP;
END $$;

-- 4b. Tag 'cliente_no_viene_de_holded' — apartados rosa del Excel.
DO $$
DECLARE
  holded_names text[] := ARRAY[
    'Libros registros de facturas emitidas y recibidas de los últimos cuatro años, más el ejercicio en curso.',
    'Avance contable del año en curso en formato Excel de los últimos 3 años (balance de situación, PYG, sumas y saldos, libro diario).',
    'Contabilidad oficial en formato Excel de los últimos 3 años (balance de situación, PYG, sumas y saldos, libro diario).',
    'Extractos bancarios del año en curso y año anterior'
  ];
  tag_id uuid;
  ap_id uuid;
  n text;
BEGIN
  SELECT id INTO tag_id FROM documentation.tags WHERE slug = 'cliente_no_viene_de_holded';
  IF tag_id IS NULL THEN RETURN; END IF;
  FOREACH n IN ARRAY holded_names LOOP
    SELECT id INTO ap_id FROM documentation.apartados WHERE name = n LIMIT 1;
    IF ap_id IS NOT NULL THEN
      INSERT INTO documentation.apartado_tags(apartado_id, tag_id)
      VALUES (ap_id, tag_id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- 4c. Tag 'solicita_alta_empresa' — Cuestionario si es alta de empresa.
DO $$
DECLARE
  tag_id uuid;
  ap_id uuid;
BEGIN
  SELECT id INTO tag_id FROM documentation.tags WHERE slug = 'solicita_alta_empresa';
  IF tag_id IS NULL THEN RETURN; END IF;
  SELECT id INTO ap_id FROM documentation.apartados
    WHERE name = 'Cuestionario si es alta de empresa' LIMIT 1;
  IF ap_id IS NOT NULL THEN
    INSERT INTO documentation.apartado_tags(apartado_id, tag_id)
    VALUES (ap_id, tag_id) ON CONFLICT DO NOTHING;
  END IF;
END $$;
