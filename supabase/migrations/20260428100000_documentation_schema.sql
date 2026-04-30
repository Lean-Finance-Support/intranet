-- Schema "documentation": catálogo de bloques/apartados y sus instancias por cliente.
-- Cada cliente recibe bloques (del catálogo) que contienen apartados con estado
-- (pendiente/enviado/validado/rechazado), archivos adjuntos, comentarios y un
-- supervisor responsable. Toda la documentación es visible (read) por
-- cualquier admin; los clientes solo ven la suya. La escritura se gatea desde
-- server actions con requirePermission.
--
-- IMPORTANTE: para que los clientes Supabase JS puedan acceder a este schema
-- via .schema('documentation'), hay que añadir 'documentation' a "Exposed
-- schemas" en Supabase Dashboard → Project Settings → API → Settings.
-- (Esto se hace una vez por proyecto, dev y prod). Sin esto la SDK devuelve 404.

CREATE SCHEMA IF NOT EXISTS documentation;

GRANT USAGE ON SCHEMA documentation TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA documentation
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

-- =============================================================================
-- 1. Enum de estado
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE documentation.apartado_status AS ENUM
    ('pendiente', 'enviado', 'validado', 'rechazado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 2. Catálogo de bloques (templates)
-- =============================================================================

CREATE TABLE documentation.blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  description   text,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documentation_blocks_order ON documentation.blocks(display_order);

-- =============================================================================
-- 3. Catálogo de apartados (templates)
-- =============================================================================

CREATE TABLE documentation.apartados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id      uuid NOT NULL REFERENCES documentation.blocks(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  description   text,
  display_order int NOT NULL DEFAULT 0,
  is_global     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block_id, name)
);

CREATE INDEX idx_documentation_apartados_block ON documentation.apartados(block_id, display_order);

-- =============================================================================
-- 4. N:M apartado <-> departments (cuando NO es global)
-- =============================================================================

CREATE TABLE documentation.apartado_departments (
  apartado_id   uuid NOT NULL REFERENCES documentation.apartados(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  PRIMARY KEY (apartado_id, department_id)
);

CREATE INDEX idx_documentation_apartado_departments_dept
  ON documentation.apartado_departments(department_id);

-- =============================================================================
-- 5. Instancias por cliente
-- =============================================================================

CREATE TABLE documentation.client_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  block_id      uuid NOT NULL REFERENCES documentation.blocks(id) ON DELETE RESTRICT,
  display_order int NOT NULL DEFAULT 0,
  added_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, block_id)
);

CREATE INDEX idx_documentation_client_blocks_company
  ON documentation.client_blocks(company_id);

CREATE TABLE documentation.client_apartados (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_block_id        uuid NOT NULL REFERENCES documentation.client_blocks(id) ON DELETE CASCADE,
  apartado_id            uuid NOT NULL REFERENCES documentation.apartados(id) ON DELETE RESTRICT,
  supervisor_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status                 documentation.apartado_status NOT NULL DEFAULT 'pendiente',
  display_order          int NOT NULL DEFAULT 0,
  added_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at               timestamptz NOT NULL DEFAULT now(),
  validated_at           timestamptz,
  validated_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at            timestamptz,
  rejected_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_rejection_reason  text,
  UNIQUE (client_block_id, apartado_id)
);

CREATE INDEX idx_documentation_client_apartados_block
  ON documentation.client_apartados(client_block_id);
CREATE INDEX idx_documentation_client_apartados_supervisor
  ON documentation.client_apartados(supervisor_id);
CREATE INDEX idx_documentation_client_apartados_status
  ON documentation.client_apartados(status);

-- =============================================================================
-- 6. Archivos adjuntos
-- =============================================================================

CREATE TABLE documentation.apartado_files (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_apartado_id  uuid NOT NULL REFERENCES documentation.client_apartados(id) ON DELETE CASCADE,
  storage_path        text NOT NULL,
  file_name           text NOT NULL,
  file_size           bigint NOT NULL,
  mime_type           text NOT NULL,
  uploaded_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  deleted_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_documentation_apartado_files_apartado
  ON documentation.apartado_files(client_apartado_id, deleted_at);

-- =============================================================================
-- 7. Historial de cambios de estado
-- =============================================================================

CREATE TABLE documentation.apartado_status_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_apartado_id  uuid NOT NULL REFERENCES documentation.client_apartados(id) ON DELETE CASCADE,
  from_status         documentation.apartado_status,
  to_status           documentation.apartado_status NOT NULL,
  changed_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  reason              text
);

CREATE INDEX idx_documentation_apartado_status_history_apartado
  ON documentation.apartado_status_history(client_apartado_id, changed_at);

-- =============================================================================
-- 8. Comentarios
-- =============================================================================

CREATE TABLE documentation.apartado_comments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_apartado_id  uuid NOT NULL REFERENCES documentation.client_apartados(id) ON DELETE CASCADE,
  author_id           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body                text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documentation_apartado_comments_apartado
  ON documentation.apartado_comments(client_apartado_id, created_at);

-- =============================================================================
-- 9. Helper: company_id de un client_apartado (para policies)
-- =============================================================================

CREATE OR REPLACE FUNCTION documentation.company_of_client_apartado(p_client_apartado_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'documentation'
AS $$
  SELECT cb.company_id
  FROM documentation.client_apartados ca
  JOIN documentation.client_blocks cb ON cb.id = ca.client_block_id
  WHERE ca.id = p_client_apartado_id;
$$;

-- =============================================================================
-- 10. Triggers updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION documentation.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER blocks_updated_at BEFORE UPDATE ON documentation.blocks
  FOR EACH ROW EXECUTE FUNCTION documentation.tg_set_updated_at();
CREATE TRIGGER apartados_updated_at BEFORE UPDATE ON documentation.apartados
  FOR EACH ROW EXECUTE FUNCTION documentation.tg_set_updated_at();

-- =============================================================================
-- 11. RLS
-- =============================================================================

ALTER TABLE documentation.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation.apartados ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation.apartado_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation.client_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation.client_apartados ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation.apartado_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation.apartado_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation.apartado_comments ENABLE ROW LEVEL SECURITY;

-- 11a. Catálogo: cualquier admin lee. Cliente lee también (necesario para mapear
--      apartado_id -> nombre desde su lista). Escritura: bloqueada por RLS, se
--      hace desde server actions con requirePermission.

CREATE POLICY admins_read_blocks ON documentation.blocks
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY clients_read_blocks ON documentation.blocks
  FOR SELECT USING (public.is_client(auth.uid()));

CREATE POLICY admins_read_apartados ON documentation.apartados
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY clients_read_apartados ON documentation.apartados
  FOR SELECT USING (public.is_client(auth.uid()));

CREATE POLICY admins_read_apartado_departments ON documentation.apartado_departments
  FOR SELECT USING (public.is_admin(auth.uid()));

-- 11b. Instancias por cliente: admin lee todo. Cliente lee solo las suyas.

CREATE POLICY admins_read_client_blocks ON documentation.client_blocks
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY clients_read_own_client_blocks ON documentation.client_blocks
  FOR SELECT USING (
    public.is_client(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profile_companies pc
      WHERE pc.profile_id = auth.uid()
        AND pc.company_id = client_blocks.company_id
    )
  );

CREATE POLICY admins_read_client_apartados ON documentation.client_apartados
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY clients_read_own_client_apartados ON documentation.client_apartados
  FOR SELECT USING (
    public.is_client(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM documentation.client_blocks cb
      JOIN public.profile_companies pc ON pc.company_id = cb.company_id
      WHERE cb.id = client_apartados.client_block_id
        AND pc.profile_id = auth.uid()
    )
  );

-- 11c. Archivos: admin lee todo. Cliente lee/inserta/borra-soft los suyos.
--      DELETE físico solo admin (no se hace desde UI, soft-delete vía UPDATE).

CREATE POLICY admins_read_apartado_files ON documentation.apartado_files
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY clients_read_own_apartado_files ON documentation.apartado_files
  FOR SELECT USING (
    public.is_client(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM documentation.client_apartados ca
      JOIN documentation.client_blocks cb ON cb.id = ca.client_block_id
      JOIN public.profile_companies pc ON pc.company_id = cb.company_id
      WHERE ca.id = apartado_files.client_apartado_id
        AND pc.profile_id = auth.uid()
    )
  );

CREATE POLICY clients_insert_own_apartado_files ON documentation.apartado_files
  FOR INSERT WITH CHECK (
    public.is_client(auth.uid())
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM documentation.client_apartados ca
      JOIN documentation.client_blocks cb ON cb.id = ca.client_block_id
      JOIN public.profile_companies pc ON pc.company_id = cb.company_id
      WHERE ca.id = apartado_files.client_apartado_id
        AND pc.profile_id = auth.uid()
    )
  );

CREATE POLICY clients_softdelete_own_apartado_files ON documentation.apartado_files
  FOR UPDATE USING (
    public.is_client(auth.uid())
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM documentation.client_apartados ca
      JOIN documentation.client_blocks cb ON cb.id = ca.client_block_id
      JOIN public.profile_companies pc ON pc.company_id = cb.company_id
      WHERE ca.id = apartado_files.client_apartado_id
        AND pc.profile_id = auth.uid()
    )
  ) WITH CHECK (
    public.is_client(auth.uid())
    AND uploaded_by = auth.uid()
  );

-- 11d. Historial: solo lectura. Admin lee todo, cliente lee el de sus apartados.
--      Escritura via server action.

CREATE POLICY admins_read_apartado_status_history ON documentation.apartado_status_history
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY clients_read_own_apartado_status_history ON documentation.apartado_status_history
  FOR SELECT USING (
    public.is_client(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM documentation.client_apartados ca
      JOIN documentation.client_blocks cb ON cb.id = ca.client_block_id
      JOIN public.profile_companies pc ON pc.company_id = cb.company_id
      WHERE ca.id = apartado_status_history.client_apartado_id
        AND pc.profile_id = auth.uid()
    )
  );

-- 11e. Comentarios: bidireccional cliente/admin.

CREATE POLICY admins_read_apartado_comments ON documentation.apartado_comments
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY clients_read_own_apartado_comments ON documentation.apartado_comments
  FOR SELECT USING (
    public.is_client(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM documentation.client_apartados ca
      JOIN documentation.client_blocks cb ON cb.id = ca.client_block_id
      JOIN public.profile_companies pc ON pc.company_id = cb.company_id
      WHERE ca.id = apartado_comments.client_apartado_id
        AND pc.profile_id = auth.uid()
    )
  );

CREATE POLICY clients_insert_own_apartado_comments ON documentation.apartado_comments
  FOR INSERT WITH CHECK (
    public.is_client(auth.uid())
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM documentation.client_apartados ca
      JOIN documentation.client_blocks cb ON cb.id = ca.client_block_id
      JOIN public.profile_companies pc ON pc.company_id = cb.company_id
      WHERE ca.id = apartado_comments.client_apartado_id
        AND pc.profile_id = auth.uid()
    )
  );
