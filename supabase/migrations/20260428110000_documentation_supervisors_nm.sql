-- Permitir múltiples supervisores por apartado (potencialmente de departamentos
-- distintos). Sustituye la columna escalar `supervisor_id` por una tabla N:M.

-- =============================================================================
-- 1. Nueva tabla N:M
-- =============================================================================

CREATE TABLE documentation.client_apartado_supervisors (
  client_apartado_id  uuid NOT NULL REFERENCES documentation.client_apartados(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_apartado_id, profile_id)
);

CREATE INDEX idx_client_apartado_supervisors_profile
  ON documentation.client_apartado_supervisors(profile_id);

-- =============================================================================
-- 2. Backfill desde la columna escalar
-- =============================================================================

INSERT INTO documentation.client_apartado_supervisors (client_apartado_id, profile_id, assigned_by, assigned_at)
SELECT id, supervisor_id, added_by, added_at
FROM documentation.client_apartados
WHERE supervisor_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. Drop columna antigua
-- =============================================================================

DROP INDEX IF EXISTS documentation.idx_documentation_client_apartados_supervisor;
ALTER TABLE documentation.client_apartados DROP COLUMN supervisor_id;

-- =============================================================================
-- 4. RLS
-- =============================================================================

ALTER TABLE documentation.client_apartado_supervisors ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_apartado_supervisors ON documentation.client_apartado_supervisors
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY clients_read_own_apartado_supervisors ON documentation.client_apartado_supervisors
  FOR SELECT USING (
    public.is_client(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM documentation.client_apartados ca
      JOIN documentation.client_blocks cb ON cb.id = ca.client_block_id
      JOIN public.profile_companies pc ON pc.company_id = cb.company_id
      WHERE ca.id = client_apartado_supervisors.client_apartado_id
        AND pc.profile_id = auth.uid()
    )
  );

-- Escritura: bloqueada por defecto. Las server actions usan service role tras
-- requirePermission/validar pertenencia a depto.
