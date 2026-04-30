-- Notificaciones de documentación
--
-- Modelo:
--   • IN-APP batched: cada acción crea/actualiza UNA sola notificación viva
--     por (recipient, company, kind='documentation'). Mientras esté no leída
--     se incrementa event_count y se sustituye el mensaje por el último.
--     Cuando el usuario la marca como leída se "cierra" — la siguiente acción
--     creará una nueva.
--   • Email diario a supervisores: a las 07:00 UTC L-V se invoca la edge
--     function notify-documentation-supervisors-daily, que recorre los
--     supervisores con apartados en estado "enviado" y manda un único email
--     resumen a cada uno.
--
-- IMPORTANTE: la extensión pg_cron debe estar instalada en el proyecto.
-- Si esta migración falla con "extension pg_cron is not available", actívala
-- en Supabase Dashboard → Database → Extensions y vuelve a aplicar.

-- =============================================================================
-- 1. Columnas para batching de notificaciones in-app
-- =============================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind        text,
  ADD COLUMN IF NOT EXISTS event_count integer NOT NULL DEFAULT 1;

-- Índice unique parcial: solo puede haber UNA notificación viva (no leída)
-- por (recipient, kind, company) — sirve como ancla para el upsert.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_dedup
  ON public.notifications (recipient_id, kind, company_id)
  WHERE is_read = false AND kind IS NOT NULL;

-- =============================================================================
-- 2. Función SECURITY DEFINER para upsert atómico
-- =============================================================================
--
-- Crea o actualiza la notificación viva del par (recipient, company, kind).
-- Devuelve el id de la notificación afectada.
--
-- Se llama desde server actions vía supabase.rpc('upsert_doc_notification', …).
-- Como las server actions ya usan service_role (admin client) bastaría con un
-- INSERT/UPDATE plano; el wrapper en SQL garantiza atomicidad y deja la
-- lógica de "agrupar últimos eventos" en un único sitio.

CREATE OR REPLACE FUNCTION public.upsert_doc_notification(
  p_recipient_id uuid,
  p_company_id   uuid,
  p_kind         text,
  p_title        text,
  p_summary      text,
  p_link         text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id        uuid;
  v_count     integer;
  v_message   text;
BEGIN
  SELECT id, event_count INTO v_id, v_count
  FROM public.notifications
  WHERE recipient_id = p_recipient_id
    AND kind         = p_kind
    AND company_id   = p_company_id
    AND is_read      = false
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.notifications (
      recipient_id, company_id, kind, title, message, link, event_count
    ) VALUES (
      p_recipient_id, p_company_id, p_kind, p_title, p_summary, p_link, 1
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  v_count := v_count + 1;
  v_message := format('%s novedades. Última: %s', v_count, p_summary);

  UPDATE public.notifications
  SET event_count = v_count,
      title       = p_title,
      message     = v_message,
      link        = p_link,
      created_at  = now(),
      is_read     = false
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_doc_notification(uuid, uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_doc_notification(uuid, uuid, text, text, text, text) TO service_role;

-- =============================================================================
-- 3. Throttle del email manual "recordar al cliente" (6h por empresa)
-- =============================================================================

CREATE TABLE IF NOT EXISTS documentation.client_reminder_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sent_by     uuid NOT NULL REFERENCES public.profiles(id),
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_client_reminder_log_company_sent
  ON documentation.client_reminder_log (company_id, sent_at DESC);

ALTER TABLE documentation.client_reminder_log ENABLE ROW LEVEL SECURITY;

-- Solo service_role escribe; admins pueden leer para mostrar última fecha.
CREATE POLICY "Admins read client_reminder_log"
  ON documentation.client_reminder_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================================================
-- 4. Cron diario para recordatorio a supervisores
-- =============================================================================
--
-- Llama a la edge function notify-documentation-supervisors-daily a las 07:00
-- UTC L-V (08:00 CET / 09:00 CEST en Madrid). La function consulta los
-- supervisores con apartados en estado "enviado" y manda un email resumen.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Si ya existía el job, lo reemplaza. cron.unschedule lanza error si no
-- existe, así que envolvemos en bloque tolerante.
DO $$
BEGIN
  PERFORM cron.unschedule('documentation-supervisor-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'documentation-supervisor-reminders',
  '0 7 * * 1-5',
  $cron$
    SELECT net.http_post(
      url     := public.app_setting('supabase_url') || '/functions/v1/notify-documentation-supervisors-daily',
      body    := jsonb_build_object('source', 'cron'),
      headers := jsonb_build_object(
                   'Content-Type',     'application/json',
                   'x-webhook-secret', public.app_setting('webhook_secret')
                 )
    );
  $cron$
);
