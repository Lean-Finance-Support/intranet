-- Equipo responsable como entidad explícita.
--
-- Hasta ahora el "equipo responsable" de un cliente se DERIVABA de quién tenía
-- rol Técnico en algún company_service. Eso impedía representar a un miembro
-- del equipo que no fuese técnico de ningún servicio y hacía que técnico,
-- supervisor y "miembro del equipo" fueran tres conceptos sin fuente de verdad.
--
-- `company_team_members` pasa a ser la fuente de verdad de la pertenencia al
-- equipo. Las filas Técnico (scope company_service) y Supervisor de apartado
-- (scope client_apartado) en `profile_roles` siguen siendo granulares, pero
-- cuelgan del equipo: ser técnico implica estar en el equipo (al asignar un
-- técnico se inserta aquí); ser supervisor NO lo implica.

CREATE TABLE public.company_team_members (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  added_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (company_id, profile_id)
);

CREATE INDEX idx_company_team_members_profile
  ON public.company_team_members (profile_id);

ALTER TABLE public.company_team_members ENABLE ROW LEVEL SECURITY;

-- Lectura/escritura solo admins. La autorización fina (qué dpts puede tocar el
-- actor) vive en los server actions. El portal cliente accede al equipo vía
-- server action con service_role, no consulta esta tabla directamente.
CREATE POLICY company_team_members_admin_select ON public.company_team_members
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY company_team_members_admin_all ON public.company_team_members
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_team_members TO authenticated;
GRANT ALL ON public.company_team_members TO service_role;

-- Backfill (Opción A): poblar el equipo con los técnicos actuales. Cada
-- (empresa, perfil) que hoy tiene rol Técnico en algún company_service de la
-- empresa entra al equipo. Los supervisores puros no se incluyen.
INSERT INTO public.company_team_members (company_id, profile_id)
SELECT DISTINCT cs.company_id, pr.profile_id
  FROM public.profile_roles pr
  JOIN public.roles r ON r.id = pr.role_id AND r.name = 'Técnico'
  JOIN public.company_services cs ON cs.id = pr.scope_id
 WHERE pr.scope_type = 'company_service'
ON CONFLICT DO NOTHING;
