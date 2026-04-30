-- Plantillas (archivos base) adjuntas a un apartado del catálogo. El cliente
-- las descarga como ayuda; no son archivos del cliente.
-- Path en el bucket: templates/{apartado_id}/{template_id}/{filename}

-- =============================================================================
-- 1. Tabla
-- =============================================================================

CREATE TABLE documentation.apartado_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartado_id   uuid NOT NULL REFERENCES documentation.apartados(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  file_size     bigint NOT NULL,
  mime_type     text NOT NULL,
  uploaded_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_apartado_templates_apartado
  ON documentation.apartado_templates(apartado_id);

-- =============================================================================
-- 2. RLS
-- =============================================================================

ALTER TABLE documentation.apartado_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_apartado_templates ON documentation.apartado_templates
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY clients_read_apartado_templates ON documentation.apartado_templates
  FOR SELECT USING (public.is_client(auth.uid()));

-- Escritura: bloqueada por defecto. Las server actions usan service role tras
-- verificar manage_documentation_catalog.

-- =============================================================================
-- 3. Storage policies para el path "templates/*" en el bucket existente
-- =============================================================================

-- Cliente: lectura libre de cualquier objeto cuyo primer segmento sea "templates"
CREATE POLICY clients_read_documentation_templates ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'client-documentation'
    AND public.is_client(auth.uid())
    AND (storage.foldername(name))[1] = 'templates'
  );
