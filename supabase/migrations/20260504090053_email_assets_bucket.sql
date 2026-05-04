-- Bucket público para imágenes embebidas en emails transaccionales (anuncios
-- de producto, capturas, banners). Lo abren clientes externos al hacer clic
-- en el email, sin sesión Supabase, así que el bucket es público.
--
-- La escritura solo se hace manualmente por admins desde el dashboard de
-- Supabase (no hay flujo de upload desde la app), por eso no creamos policies
-- de INSERT/UPDATE/DELETE; con el bucket público basta para que SELECT
-- funcione vía la URL `/storage/v1/object/public/email-assets/<file>`.
--
-- Convención de path: nombre plano descriptivo (`<slug>-<n>.png`), por ejemplo
-- `dashboard-holded-1.png`. La edge function notify-documentation-template-email
-- referencia las imágenes con la URL pública construida desde SUPABASE_URL.

INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;
