-- Recreate documentation.apartado_supervisors_v with SECURITY INVOKER so that
-- RLS policies are evaluated against the querying user, not the view owner.
CREATE OR REPLACE VIEW documentation.apartado_supervisors_v
  WITH (security_invoker = true)
AS
SELECT
  pr.scope_id    AS client_apartado_id,
  pr.profile_id,
  pr.created_at  AS assigned_at,
  prof.email     AS profile_email,
  prof.full_name AS profile_full_name
FROM public.profile_roles pr
JOIN public.roles    r    ON r.id = pr.role_id
JOIN public.profiles prof ON prof.id = pr.profile_id
WHERE r.name = 'Supervisor de apartado'
  AND pr.scope_type = 'client_apartado';

GRANT SELECT ON documentation.apartado_supervisors_v TO authenticated, service_role;
