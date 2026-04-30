-- Pequeños ajustes sobre el sistema de notificaciones de documentación:
--   1. El mensaje agrupado usa "Novedades" en mayúscula.

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
  v_message := format('%s Novedades. Última: %s', v_count, p_summary);

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
