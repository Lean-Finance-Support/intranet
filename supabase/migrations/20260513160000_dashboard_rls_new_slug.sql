-- Actualiza la RLS de dashboard.client_dashboards para usar el nuevo slug del
-- servicio padre. Tras la migración del catálogo (20260513150000), el slug
-- 'dashboard' dejó de existir y pasó a ser 'gestion-administrativa-externalizada'.
-- La política previa seguía exigiendo el slug viejo, dejando a los clientes
-- sin acceso a leer la config de su propio dashboard (los admins seguían
-- viéndolo porque tienen su propia política basada en is_admin).

DROP POLICY IF EXISTS clients_read_own_client_dashboard ON dashboard.client_dashboards;

CREATE POLICY clients_read_own_client_dashboard ON dashboard.client_dashboards
  FOR SELECT USING (
    public.is_client(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profile_companies pc
      JOIN public.company_services cs ON cs.company_id = pc.company_id
      JOIN public.services s ON s.id = cs.service_id
      WHERE pc.profile_id = auth.uid()
        AND pc.company_id = client_dashboards.company_id
        AND s.slug = 'gestion-administrativa-externalizada'
        AND cs.is_active
    )
  );
