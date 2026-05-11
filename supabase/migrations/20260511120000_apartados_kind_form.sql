-- Documentación: apartados que NO requieren archivos adjuntos.
--
-- Hasta ahora todo apartado se rellenaba subiendo ficheros. Hay 2 casos del
-- catálogo en los que el cliente no aporta archivos sino datos estructurados:
--   · "Alta en el portal de ENISA"            → usuario + contraseña (cifrada)
--   · "Listado de competidores, directos…"    → lista repetible {comercial, fiscal, CIF}
--
-- Modelo:
--   · documentation.apartados.kind ∈ ('file','form')
--   · documentation.apartados.slug — identificador estable para mapear apartados
--     `form` a su componente React por slug. Obligatorio cuando kind='form'.
--   · documentation.client_apartados.form_response JSONB — payload del cliente
--     para apartados `form`. La forma concreta la valida el server action por slug.

-- ─── 1. Enum kind ────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE documentation.apartado_kind AS ENUM ('file', 'form');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Columnas en apartados ───────────────────────────────────────────────

ALTER TABLE documentation.apartados
  ADD COLUMN IF NOT EXISTS kind documentation.apartado_kind NOT NULL DEFAULT 'file',
  ADD COLUMN IF NOT EXISTS slug text;

-- slug único cuando está presente (kind='form' lo exige; kind='file' lo deja null).
CREATE UNIQUE INDEX IF NOT EXISTS idx_documentation_apartados_slug_unique
  ON documentation.apartados (slug)
  WHERE slug IS NOT NULL;

-- form ⇒ slug obligatorio.
ALTER TABLE documentation.apartados
  DROP CONSTRAINT IF EXISTS apartados_form_requires_slug;
ALTER TABLE documentation.apartados
  ADD CONSTRAINT apartados_form_requires_slug
    CHECK (kind = 'file' OR slug IS NOT NULL);

-- ─── 3. form_response en client_apartados ───────────────────────────────────

ALTER TABLE documentation.client_apartados
  ADD COLUMN IF NOT EXISTS form_response jsonb;

-- ─── 4. Marcar apartados existentes como kind='form' ────────────────────────

-- ENISA: "Alta en el portal de ENISA" (block slug 'enisa').
UPDATE documentation.apartados a
SET kind = 'form', slug = 'enisa-credentials'
FROM documentation.blocks b
WHERE a.block_id = b.id
  AND b.slug = 'enisa'
  AND a.name = 'Alta en el portal de ENISA';

-- Competidores: "Listado de competidores, directos o indirectos." (block 'cfo').
UPDATE documentation.apartados a
SET kind = 'form', slug = 'competidores'
FROM documentation.blocks b
WHERE a.block_id = b.id
  AND b.slug = 'cfo'
  AND a.name = 'Listado de competidores, directos o indirectos.';
