-- Parametriza los triggers de notificaciones para que la URL del proyecto y
-- el webhook secret vengan de una tabla `public.app_settings` en lugar de
-- estar hardcoded. (Supabase Free no permite ALTER DATABASE para GUCs.)
--
-- Configuración requerida en cada entorno (ejecutar UNA vez por proyecto):
--   INSERT INTO public.app_settings (key, value) VALUES
--     ('supabase_url',   'https://<ref>.supabase.co'),
--     ('webhook_secret', '<secret>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Nadie excepto service_role debe leer esta tabla — contiene el webhook secret.
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM anon, authenticated;

-- Helper: lee un valor. SECURITY DEFINER para que los triggers puedan leerlo
-- sin conceder permisos a los roles que disparan inserts.
CREATE OR REPLACE FUNCTION public.app_setting(setting_key text)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT value FROM public.app_settings WHERE key = setting_key;
$$;
REVOKE ALL ON FUNCTION public.app_setting(text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.trigger_notify_tax_models()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url     := public.app_setting('supabase_url') || '/functions/v1/notify-tax-models',
    body    := jsonb_build_object(
                 'company_id',        NEW.company_id,
                 'year',              NEW.year,
                 'quarter',           NEW.quarter,
                 'notification_type', NEW.notification_type
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', public.app_setting('webhook_secret')
               )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_notify_enisa_welcome()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url     := public.app_setting('supabase_url') || '/functions/v1/notify-enisa-welcome',
    body    := jsonb_build_object(
                 'company_id',        NEW.company_id,
                 'notification_type', NEW.notification_type
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', public.app_setting('webhook_secret')
               )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_notify_enisa_submission()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url     := public.app_setting('supabase_url') || '/functions/v1/notify-enisa-submission',
    body    := jsonb_build_object(
                 'record', jsonb_build_object(
                   'company_id',   NEW.company_id,
                   'submitted_by', NEW.submitted_by
                 )
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', public.app_setting('webhook_secret')
               )
  );
  RETURN NEW;
END;
$$;

-- (Re)instalar el trigger on auth.users → handle_new_user por si un reset de
-- la DB eliminó el trigger del schema auth.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
