-- ============================================================================
-- Fix P0 de seguridad — funciones SECURITY DEFINER expuestas a PUBLIC
-- ============================================================================
-- La migración `20260414120100_parametrize_notifications.sql` intentaba revocar
-- EXECUTE sobre `public.app_setting` para `anon` y `authenticated`, pero no
-- revocó de `PUBLIC` (rol implícito que hereda EXECUTE por defecto al crear
-- funciones). Resultado verificado en prod (2026-05-11): cualquiera con la
-- `anon key` podía hacer `POST /rest/v1/rpc/app_setting` y obtener
-- `webhook_secret` en texto plano.
--
-- `public.upsert_doc_notification` tiene el mismo defecto: como es
-- SECURITY DEFINER y mantiene el grant a PUBLIC, anon podía insertar
-- notificaciones arbitrarias (con title/message/link controlados) en la
-- bandeja de entrada de cualquier usuario.
--
-- Ambas funciones solo deben ejecutarse desde contextos privilegiados:
--   * `app_setting`: triggers internos que usan `pg_net` corren como
--     postgres/service_role.
--   * `upsert_doc_notification`: edge functions invocadas con service_role.
--
-- Por seguridad se revoca también de `anon`/`authenticated` explícitamente
-- por si una migración futura re-otorga a PUBLIC.
--
-- Tras aplicar esta migración hay que rotar el `webhook_secret` (puede haber
-- sido extraído mientras la vulnerabilidad estaba abierta) y actualizarlo en:
--   1. `public.app_settings` (vía SQL)
--   2. secrets de las edge functions: `supabase secrets set WEBHOOK_SECRET=...`
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.app_setting(text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_doc_notification(
  uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
