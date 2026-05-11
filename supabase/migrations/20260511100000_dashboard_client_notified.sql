-- Marca cuándo se notificó al cliente que su dashboard está listo. Se setea
-- una única vez desde el panel admin con el botón "Notificar al cliente"
-- (botón de único uso). Si está NULL, el botón aparece habilitado; si
-- contiene timestamp, se muestra la fecha en la UI y el botón queda
-- deshabilitado.

ALTER TABLE dashboard.client_dashboards
  ADD COLUMN client_notified_at timestamptz,
  ADD COLUMN notified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
