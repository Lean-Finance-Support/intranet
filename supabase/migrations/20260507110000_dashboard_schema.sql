-- Schema "dashboard": configuración del dashboard fiscal de cada empresa cliente.
-- Cada empresa con el servicio 'dashboard' contratado tiene un Google Sheet
-- asociado donde vive su dashboard. El portal cliente lo lee server-side con
-- service account + Google Sheets API; aquí solo guardamos las referencias
-- (sheet_id + nombre de la hoja a renderizar).
--
-- IMPORTANTE: para que los clientes Supabase JS puedan acceder a este schema
-- via .schema('dashboard'), hay que añadir 'dashboard' a "Exposed schemas"
-- en Supabase Dashboard → Project Settings → API → Settings.
-- (Esto se hace una vez por proyecto, dev y prod). Sin esto la SDK devuelve 404.

CREATE SCHEMA IF NOT EXISTS dashboard;

GRANT USAGE ON SCHEMA dashboard TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dashboard
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

-- =============================================================================
-- 1. Tabla: configuración del Sheet por empresa
-- =============================================================================

CREATE TABLE dashboard.client_dashboards (
  company_id   uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  sheet_id     text NOT NULL,
  sheet_name   text NOT NULL,
  sheet_gid    bigint,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE dashboard.client_dashboards IS
  'Configuración del Google Sheet del dashboard fiscal de cada empresa cliente.';

-- =============================================================================
-- 2. Trigger updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION dashboard.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER client_dashboards_updated_at
  BEFORE UPDATE ON dashboard.client_dashboards
  FOR EACH ROW EXECUTE FUNCTION dashboard.tg_set_updated_at();

-- =============================================================================
-- 3. RLS
-- =============================================================================

ALTER TABLE dashboard.client_dashboards ENABLE ROW LEVEL SECURITY;

-- Admins leen y escriben todo. La autorización fina (qué admin de qué dept
-- puede gestionar el dashboard) vive en server actions vía
-- requirePermission('write_dept_service', dept Asesoría Fiscal).
CREATE POLICY admins_read_client_dashboards ON dashboard.client_dashboards
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY admins_insert_client_dashboards ON dashboard.client_dashboards
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admins_update_client_dashboards ON dashboard.client_dashboards
  FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admins_delete_client_dashboards ON dashboard.client_dashboards
  FOR DELETE USING (public.is_admin(auth.uid()));

-- Clientes leen solo el dashboard de sus empresas, y solo si esa empresa
-- tiene el servicio 'dashboard' activo.
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
        AND s.slug = 'dashboard'
        AND cs.is_active
    )
  );
