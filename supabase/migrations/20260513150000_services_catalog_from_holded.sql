-- Carga del catálogo de servicios desde el listado de Holded (Lean Finance SL).
--
-- Cambios incluidos:
--   1. Alta del departamento "Asesoría Legal" (nuevo).
--   2. Migración de los servicios "tax-models" y "dashboard" — que pasan a ser
--      *features* desbloqueadas por sus servicios padre — hacia:
--        - tax-models → "Asesoramiento fiscal y contable"
--        - dashboard  → "Gestión administrativa externalizada"
--      Esto implica: insertar el servicio padre, mover los company_services y
--      los profile_roles (técnicos) al nuevo scope, y borrar el viejo.
--   3. Carga del resto del catálogo del Holded (~45 servicios extra) con sus
--      department_services correspondientes.
--
-- Notas:
--   - services.slug es UNIQUE — usamos ON CONFLICT DO NOTHING.
--   - company_services.(company_id, service_id) es UNIQUE — usamos
--     ON CONFLICT DO UPDATE SET is_active = true para garantizar que el padre
--     queda activo aunque ya estuviera contratado por otra vía.
--   - profile_roles.scope_id NO tiene FK (es polimórfico); hay que borrar
--     filas huérfanas explícitamente antes de borrar el company_services viejo.

-- ---------------------------------------------------------------------------
-- 1. Nuevo departamento "Asesoría Legal".
-- ---------------------------------------------------------------------------
INSERT INTO public.departments (slug, name, display_order)
VALUES ('asesoria-legal', 'Asesoría Legal', 70)
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. Inserción del catálogo. Slugs estables (referenciables desde código).
--    Los dos primeros — "asesoramiento-fiscal-y-contable" y
--    "gestion-administrativa-externalizada" — son los servicios padre que
--    sustituyen a tax-models y dashboard.
-- ---------------------------------------------------------------------------
INSERT INTO public.services (slug, name, description, display_order) VALUES
  -- Asesoría Fiscal y Contable
  ('asesoramiento-fiscal-y-contable',      'Asesoramiento fiscal y contable',                            'Cuota mensual de asesoramiento fiscal y contable.',                                                                       10),
  ('gestion-administrativa-externalizada', 'Gestión administrativa externalizada',                       'Registro de gastos, nóminas y conciliaciones bancarias.',                                                                  20),
  ('expedicion-certificados-digitales',    'Expedición de certificados digitales',                       'Gestión ante la FNMT.',                                                                                                    30),
  ('elaboracion-presentacion-cuentas-anuales', 'Elaboración y presentación de Cuentas Anuales',          'Presentación de CCAA ante el Registro Mercantil.',                                                                         40),
  ('elaboracion-legalizacion-libros',      'Elaboración y legalización de libros',                       'Legalización de libros ante el Registro Mercantil.',                                                                       50),
  ('impuesto-sociedades',                  'Elaboración y presentación del Impuesto sobre Sociedades',   'Impuesto sobre sociedades (modelo 200).',                                                                                  60),
  ('comisiones-holded-partners',           'Comisiones Holded Partners',                                 'Comisiones por cuentas vinculadas en nuestro portal.',                                                                     70),
  ('formaciones-holded',                   'Formaciones sobre Holded',                                   'Servicios de formación en el uso y parametrización de Holded.',                                                            80),
  ('inscripciones-registro-mercantil',     'Inscripciones ante el Registro Mercantil',                   'Gestiones llevadas a cabo para inscribir documentación ante el Registro Mercantil.',                                       90),
  ('impuesto-renta',                       'Elaboración y presentación del Impuesto sobre la Renta',     NULL,                                                                                                                       100),
  ('declaracion-renta',                    'Declaración de la renta',                                    'Presentación modelo 100 — AEAT.',                                                                                          110),
  ('suplidos',                             'Suplidos',                                                   NULL,                                                                                                                       120),
  ('gastos-reembolsables',                 'Gastos reembolsables',                                       NULL,                                                                                                                       130),
  -- Asesoría Laboral
  ('gestion-laboral',                      'Gestión laboral',                                            'Nóminas realizadas en el mes.',                                                                                            200),
  ('asesoramiento-laboral',                'Asesoramiento laboral',                                      'Cuota mensual de asesoramiento laboral.',                                                                                  210),
  -- Finanzas
  ('lean-finance-cfo',                     'Lean Finance CFO',                                           'Servicio de dirección financiera externalizada.',                                                                          300),
  ('due-diligence',                        'Servicio Due Diligence',                                     'Evaluación exhaustiva de la situación financiera para procesos de adquisición o inversión.',                               310),
  ('data-room-ronda',                      'Data Room para levantar ronda',                              'Creación de carpeta con todos los archivos detallados para levantar capital, que incluye plan de negocio detallado con valoración de la compañía.', 320),
  ('acompanamiento-ronda',                 'Acompañamiento a ronda',                                     'Tras la elaboración del Data Room, asesoramiento en el proceso de búsqueda y negociación con inversores.',                  330),
  ('investor-deck',                        'Investor Deck',                                              'Elaboración de un deck adecuado para levantar capital.',                                                                   340),
  ('estrategia-crecimiento-financiacion',  'Elaboración de la estrategia de crecimiento y financiación', 'Proyecciones mensualizadas a 4 años describiendo el roadmap de la compañía.',                                              350),
  ('soporte-auditoria',                    'Soporte a auditoría',                                        'Asistencia durante procesos de auditoría.',                                                                                360),
  ('financiacion-bancaria',                'Documentación y asesoramiento búsqueda financiación bancaria','Asistencia en la obtención de financiación bancaria.',                                                                    370),
  ('asesoramiento-financiero-oneshot',     'Asesoramiento financiero oneshot',                           NULL,                                                                                                                       380),
  -- Financiación Pública
  ('prestamo-enisa',                       'Préstamo ENISA',                                             'Asesoramiento para la obtención de financiación pública ENISA.',                                                           400),
  ('certificacion-empresa-emergente',      'Certificación Empresa Emergente',                            'Obtención del certificado de empresa emergente otorgado por ENISA.',                                                       410),
  ('cdti',                                 'CDTI',                                                       'Asesoramiento para la obtención de financiación pública CDTI.',                                                            420),
  ('renegociacion-enisa',                  'Renegociación ENISA',                                        'Gestiones para renegociar los préstamos con ENISA.',                                                                       430),
  ('seguimiento-obligaciones-enisa',       'Seguimiento obligaciones ENISA',                             NULL,                                                                                                                       440),
  ('desistimiento-enisa',                  'Desistimiento financiación ENISA',                           NULL,                                                                                                                       450),
  ('subvenciones',                         'Subvenciones',                                               NULL,                                                                                                                       460),
  ('fundraising-publico',                  'Fundraising público',                                        NULL,                                                                                                                       470),
  ('suscripcion-plataforma-ayudas',        'Suscripción mensual plataforma de ayudas',                   'Plan básico.',                                                                                                             480),
  ('ayudas-contratacion',                  'Gestión de ayudas a la contratación',                        NULL,                                                                                                                       490),
  ('subvencion-empyme',                    'Subvención EMPYME',                                          NULL,                                                                                                                       500),
  ('certamen-jovenes-emprendedores',       'Ayuda Certamen Jóvenes Emprendedores',                       NULL,                                                                                                                       510),
  -- Asesoría Legal
  ('asesoramiento-legal-rondas',           'Asesoramiento legal en rondas de inversión',                 NULL,                                                                                                                       600),
  ('constitucion-sociedad',                'Servicio legal para constitución de sociedad',               NULL,                                                                                                                       610),
  ('diagnostico-hoja-ruta',                'Diagnóstico y hoja de ruta estratégica',                     NULL,                                                                                                                       620),
  ('compraventa-participaciones',          'Servicio Compraventa de participaciones',                    NULL,                                                                                                                       630),
  ('redaccion-contrato-prestamo',          'Redacción contrato de préstamo',                             NULL,                                                                                                                       640),
  -- Data / Tech
  ('servicios-data',                       'Servicios DATA',                                             NULL,                                                                                                                       700),
  -- Comercial / Marketing
  ('linkedin-oferta-laboral',              'Mantenimiento y gestión de la oferta laboral en LinkedIn',   NULL,                                                                                                                       800),
  ('externalizacion-reclutamiento',        'Externalización del proceso de reclutamiento',               NULL,                                                                                                                       810),
  -- Transversales (sin departamento)
  ('prescripciones-banco-sabadell',        'Prescripciones del Banco Sabadell',                          'Alta como cliente del banco.',                                                                                             900),
  ('saas-growth',                          'SaaS Growth',                                                'Implementación de sistemas de ventas B2B.',                                                                                910),
  ('servicios-lean-finance',               'Servicios prestados por Lean Finance',                       NULL,                                                                                                                       920)
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Vinculación servicio ↔ departamento.
-- ---------------------------------------------------------------------------

-- Asesoría Fiscal y Contable
INSERT INTO public.department_services (department_id, service_id)
SELECT d.id, s.id
FROM public.departments d
JOIN public.services s ON s.slug IN (
  'asesoramiento-fiscal-y-contable',
  'gestion-administrativa-externalizada',
  'expedicion-certificados-digitales',
  'elaboracion-presentacion-cuentas-anuales',
  'elaboracion-legalizacion-libros',
  'impuesto-sociedades',
  'comisiones-holded-partners',
  'formaciones-holded',
  'inscripciones-registro-mercantil',
  'impuesto-renta',
  'declaracion-renta',
  'suplidos',
  'gastos-reembolsables'
)
WHERE d.slug = 'asesoria-fiscal-y-contable'
ON CONFLICT DO NOTHING;

-- Asesoría Laboral
INSERT INTO public.department_services (department_id, service_id)
SELECT d.id, s.id
FROM public.departments d
JOIN public.services s ON s.slug IN ('gestion-laboral', 'asesoramiento-laboral')
WHERE d.slug = 'asesoria-laboral'
ON CONFLICT DO NOTHING;

-- Finanzas
INSERT INTO public.department_services (department_id, service_id)
SELECT d.id, s.id
FROM public.departments d
JOIN public.services s ON s.slug IN (
  'lean-finance-cfo',
  'due-diligence',
  'data-room-ronda',
  'acompanamiento-ronda',
  'investor-deck',
  'estrategia-crecimiento-financiacion',
  'soporte-auditoria',
  'financiacion-bancaria',
  'asesoramiento-financiero-oneshot'
)
WHERE d.slug = 'finanzas'
ON CONFLICT DO NOTHING;

-- Financiación Pública
INSERT INTO public.department_services (department_id, service_id)
SELECT d.id, s.id
FROM public.departments d
JOIN public.services s ON s.slug IN (
  'prestamo-enisa',
  'certificacion-empresa-emergente',
  'cdti',
  'renegociacion-enisa',
  'seguimiento-obligaciones-enisa',
  'desistimiento-enisa',
  'subvenciones',
  'fundraising-publico',
  'suscripcion-plataforma-ayudas',
  'ayudas-contratacion',
  'subvencion-empyme',
  'certamen-jovenes-emprendedores'
)
WHERE d.slug = 'financiacion-publica'
ON CONFLICT DO NOTHING;

-- Asesoría Legal
INSERT INTO public.department_services (department_id, service_id)
SELECT d.id, s.id
FROM public.departments d
JOIN public.services s ON s.slug IN (
  'asesoramiento-legal-rondas',
  'constitucion-sociedad',
  'diagnostico-hoja-ruta',
  'compraventa-participaciones',
  'redaccion-contrato-prestamo'
)
WHERE d.slug = 'asesoria-legal'
ON CONFLICT DO NOTHING;

-- Data / Tech
INSERT INTO public.department_services (department_id, service_id)
SELECT d.id, s.id
FROM public.departments d
JOIN public.services s ON s.slug IN ('servicios-data')
WHERE d.slug = 'data-tech'
ON CONFLICT DO NOTHING;

-- Comercial / Marketing
INSERT INTO public.department_services (department_id, service_id)
SELECT d.id, s.id
FROM public.departments d
JOIN public.services s ON s.slug IN ('linkedin-oferta-laboral', 'externalizacion-reclutamiento')
WHERE d.slug = 'comercial-marketing'
ON CONFLICT DO NOTHING;

-- Transversales (sin department_services — quedan como servicios sin dpto)


-- ---------------------------------------------------------------------------
-- 4. Migración tax-models → asesoramiento-fiscal-y-contable.
--    a) Garantizar que cada empresa con tax-models tiene el padre contratado.
--    b) Mover técnicos (profile_roles con scope_type='company_service') al
--       nuevo scope_id correspondiente al padre.
--    c) Borrar profile_roles huérfanos (no hay FK polimórfica).
--    d) Borrar company_services del servicio viejo.
--    e) Borrar el service tax-models del catálogo.
-- ---------------------------------------------------------------------------

-- 4.a Crear/activar el company_service del padre para cada empresa con tax-models
INSERT INTO public.company_services (company_id, service_id, is_active)
SELECT cs.company_id, new_svc.id, true
FROM public.company_services cs
JOIN public.services old_svc ON old_svc.id = cs.service_id AND old_svc.slug = 'tax-models'
CROSS JOIN public.services new_svc
WHERE new_svc.slug = 'asesoramiento-fiscal-y-contable'
ON CONFLICT (company_id, service_id) DO UPDATE SET is_active = true;

-- 4.b Migrar técnicos del scope_id antiguo al nuevo
INSERT INTO public.profile_roles (profile_id, role_id, scope_type, scope_id, grant_level)
SELECT pr.profile_id, pr.role_id, 'company_service'::permission_scope_type, new_cs.id, pr.grant_level
FROM public.profile_roles pr
JOIN public.company_services old_cs ON old_cs.id = pr.scope_id
JOIN public.services old_svc ON old_svc.id = old_cs.service_id AND old_svc.slug = 'tax-models'
JOIN public.services new_svc ON new_svc.slug = 'asesoramiento-fiscal-y-contable'
JOIN public.company_services new_cs ON new_cs.company_id = old_cs.company_id AND new_cs.service_id = new_svc.id
WHERE pr.scope_type = 'company_service'
ON CONFLICT ON CONSTRAINT profile_roles_unique DO NOTHING;

-- 4.c Borrar profile_roles antiguos (huérfanos tras 4.b)
DELETE FROM public.profile_roles pr
USING public.company_services old_cs, public.services old_svc
WHERE pr.scope_type = 'company_service'
  AND pr.scope_id = old_cs.id
  AND old_cs.service_id = old_svc.id
  AND old_svc.slug = 'tax-models';

-- 4.d Borrar company_services del servicio viejo (cascade no aplica a profile_roles)
DELETE FROM public.company_services
WHERE service_id = (SELECT id FROM public.services WHERE slug = 'tax-models');

-- 4.e Borrar el service tax-models (cascadea department_services)
DELETE FROM public.services WHERE slug = 'tax-models';


-- ---------------------------------------------------------------------------
-- 5. Migración dashboard → gestion-administrativa-externalizada.
--    Mismo proceso. dashboard.client_dashboards no se toca: está vinculado por
--    company_id, no por company_service.id.
-- ---------------------------------------------------------------------------

INSERT INTO public.company_services (company_id, service_id, is_active)
SELECT cs.company_id, new_svc.id, true
FROM public.company_services cs
JOIN public.services old_svc ON old_svc.id = cs.service_id AND old_svc.slug = 'dashboard'
CROSS JOIN public.services new_svc
WHERE new_svc.slug = 'gestion-administrativa-externalizada'
ON CONFLICT (company_id, service_id) DO UPDATE SET is_active = true;

INSERT INTO public.profile_roles (profile_id, role_id, scope_type, scope_id, grant_level)
SELECT pr.profile_id, pr.role_id, 'company_service'::permission_scope_type, new_cs.id, pr.grant_level
FROM public.profile_roles pr
JOIN public.company_services old_cs ON old_cs.id = pr.scope_id
JOIN public.services old_svc ON old_svc.id = old_cs.service_id AND old_svc.slug = 'dashboard'
JOIN public.services new_svc ON new_svc.slug = 'gestion-administrativa-externalizada'
JOIN public.company_services new_cs ON new_cs.company_id = old_cs.company_id AND new_cs.service_id = new_svc.id
WHERE pr.scope_type = 'company_service'
ON CONFLICT ON CONSTRAINT profile_roles_unique DO NOTHING;

DELETE FROM public.profile_roles pr
USING public.company_services old_cs, public.services old_svc
WHERE pr.scope_type = 'company_service'
  AND pr.scope_id = old_cs.id
  AND old_cs.service_id = old_svc.id
  AND old_svc.slug = 'dashboard';

DELETE FROM public.company_services
WHERE service_id = (SELECT id FROM public.services WHERE slug = 'dashboard');

DELETE FROM public.services WHERE slug = 'dashboard';
