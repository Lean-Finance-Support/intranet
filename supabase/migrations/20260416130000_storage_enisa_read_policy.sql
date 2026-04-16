-- Alinea la policy de lectura del bucket "enisa-documents" entre entornos.
-- Prod tenía una versión que referenciaba el enum user_role directamente
-- (con 'superadmin'), que se rompió al reducir el enum en 20260415084000.
-- Dev nunca tuvo esta policy. Aquí creamos/recreamos una idempotente usando
-- el helper is_admin() para que sobreviva a cambios futuros del enum.

SET search_path = public;

DROP POLICY IF EXISTS admins_read_all_enisa ON storage.objects;

CREATE POLICY admins_read_all_enisa ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'enisa-documents'
    AND public.is_admin(auth.uid())
  );
