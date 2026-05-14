-- Migra el feature "Dashboard fiscal" del servicio "Gestión administrativa
-- externalizada" al servicio "Asesoramiento fiscal y contable". A partir de
-- esta migración el Dashboard se desbloquea — tanto en código como en RLS —
-- con el mismo servicio padre que los Modelos fiscales.
--
-- El servicio 'gestion-administrativa-externalizada' sigue existiendo en el
-- catálogo (Holded) pero ya no gatea ningún feature.

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
        AND s.slug = 'asesoramiento-fiscal-y-contable'
        AND cs.is_active
    )
  );
