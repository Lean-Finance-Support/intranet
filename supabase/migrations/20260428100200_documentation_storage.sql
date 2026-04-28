-- Bucket privado para los archivos de documentación de clientes y sus policies.
-- Convención de path: {company_id}/{client_apartado_id}/{file_id}/{filename}
-- (storage.foldername(name)[1] devuelve el primer segmento sin barras).

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documentation', 'client-documentation', false)
ON CONFLICT (id) DO NOTHING;

-- Policies (idempotentes)
DROP POLICY IF EXISTS admins_select_client_documentation ON storage.objects;
DROP POLICY IF EXISTS admins_write_client_documentation ON storage.objects;
DROP POLICY IF EXISTS clients_select_own_client_documentation ON storage.objects;
DROP POLICY IF EXISTS clients_insert_own_client_documentation ON storage.objects;

-- Admin: lectura libre y escritura libre (incluye DELETE; los clientes no borran)
CREATE POLICY admins_select_client_documentation ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'client-documentation'
    AND public.is_admin(auth.uid())
  );

CREATE POLICY admins_write_client_documentation ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'client-documentation'
    AND public.is_admin(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'client-documentation'
    AND public.is_admin(auth.uid())
  );

-- Cliente: lectura solo de archivos cuyo path empieza por una company_id
-- vinculada al usuario en profile_companies.
CREATE POLICY clients_select_own_client_documentation ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'client-documentation'
    AND public.is_client(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profile_companies pc
      WHERE pc.profile_id = auth.uid()
        AND pc.company_id::text = (storage.foldername(name))[1]
    )
  );

-- Cliente: inserción solo bajo su company_id.
CREATE POLICY clients_insert_own_client_documentation ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'client-documentation'
    AND public.is_client(auth.uid())
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profile_companies pc
      WHERE pc.profile_id = auth.uid()
        AND pc.company_id::text = (storage.foldername(name))[1]
    )
  );

-- Nota: no se da DELETE a clientes; el "borrado" es lógico (apartado_files.deleted_at).
