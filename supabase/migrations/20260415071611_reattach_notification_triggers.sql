-- Repara los 3 triggers de notificaciones en entornos donde fueron borrados
-- (en dev se perdieron por un DROP FUNCTION ... CASCADE durante la puesta en
-- marcha del pipeline). Idempotente: DROP IF EXISTS + CREATE.
--
-- En prod estos triggers ya existen sin cambios, así que aplicar esta
-- migración es un no-op seguro (recrea los mismos CREATE TRIGGER que ya
-- estaban en el baseline).

DROP TRIGGER IF EXISTS on_tax_notification_inserted ON public.tax_notifications;
CREATE TRIGGER on_tax_notification_inserted
  AFTER INSERT ON public.tax_notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_notify_tax_models();

DROP TRIGGER IF EXISTS on_enisa_welcome_email_inserted ON public.enisa_notifications;
CREATE TRIGGER on_enisa_welcome_email_inserted
  AFTER INSERT ON public.enisa_notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_notify_enisa_welcome();

DROP TRIGGER IF EXISTS on_enisa_submission_inserted ON public.enisa_submissions;
CREATE TRIGGER on_enisa_submission_inserted
  AFTER INSERT ON public.enisa_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_notify_enisa_submission();
