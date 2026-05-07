-- Alta del servicio "Dashboard" en el catálogo y vinculación al
-- departamento Asesoría Fiscal y Contable.

INSERT INTO public.services (slug, name, description, display_order)
VALUES (
  'dashboard',
  'Dashboard',
  'Dashboard fiscal y contable de la empresa, alimentado por el equipo de asesoría.',
  20
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.department_services (department_id, service_id)
SELECT d.id, s.id
FROM public.departments d
CROSS JOIN public.services s
WHERE d.slug = 'asesoria-fiscal-y-contable'
  AND s.slug = 'dashboard'
ON CONFLICT DO NOTHING;
