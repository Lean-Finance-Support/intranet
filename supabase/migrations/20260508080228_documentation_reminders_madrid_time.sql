-- Mover el recordatorio diario a supervisores a las 07:00 hora de Madrid.
--
-- pg_cron solo entiende UTC y Madrid alterna entre CET (UTC+1, invierno) y
-- CEST (UTC+2, verano). Para que el email salga siempre a las 07:00 hora
-- local programamos el cron en las DOS horas UTC que pueden corresponder
-- (05:00 UTC en verano, 06:00 UTC en invierno) y dejamos que la edge function
-- haga early-return cuando la hora real de Madrid no sea las 7.
--
-- Antes: '0 7 * * 1-5' (= 08:00 CET / 09:00 CEST en Madrid).
-- Ahora: '0 5,6 * * 1-5' (UTC) + guard horario en la function = 07:00 Madrid.

DO $$
BEGIN
  PERFORM cron.unschedule('documentation-supervisor-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'documentation-supervisor-reminders',
  '0 5,6 * * 1-5',
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
