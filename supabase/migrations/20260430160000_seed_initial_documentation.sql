-- Seed del catálogo de documentación inicial extraído de la hoja
-- "Documentación inicial" del equipo. Inserta 8 bloques nuevos con sus
-- apartados y los vincula a los departamentos correspondientes.
-- Idempotente: ON CONFLICT en slug (blocks), (block_id, name) (apartados) y
-- la PK compuesta de apartado_departments.

-- ----------------------------------------------------------------------------
-- 1. Bloques (display_order > 10 para colocarse después de "Contratos")
-- ----------------------------------------------------------------------------

INSERT INTO documentation.blocks (name, slug, description, display_order)
VALUES
  ('Constitución y socios',                       'constitucion-y-socios',                       NULL, 20),
  ('Deuda',                                       'deuda',                                       NULL, 30),
  ('Contabilidad',                                'contabilidad',                                NULL, 40),
  ('Bancos',                                      'bancos',                                      NULL, 50),
  ('Datos societarios básicos y certificados',    'datos-societarios-basicos-y-certificados',    NULL, 60),
  ('ENISA',                                       'enisa',                                       NULL, 70),
  ('CFO',                                         'cfo',                                         NULL, 80),
  ('Laboral',                                     'laboral',                                     NULL, 90)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Apartados
-- ----------------------------------------------------------------------------

-- Constitución y socios
INSERT INTO documentation.apartados (block_id, name, description, display_order, is_global)
SELECT b.id, v.name, NULL, v.display_order, false
FROM documentation.blocks b
CROSS JOIN (
  VALUES
    ('DNI de los socios en PDF, NIE o Pasaporte',                                 10),
    ('Escritura de Acta Notarial de Manifestaciones sobre Titularidad Real',      20),
    ('Escrituras de Constitución inscritas en el Registro Mercantil',             30),
    ('Escrituras posteriores, si las hay.',                                       40),
    ('Captable, si estuviese disponible.',                                        50)
) AS v(name, display_order)
WHERE b.slug = 'constitucion-y-socios'
ON CONFLICT (block_id, name) DO NOTHING;

-- Deuda
INSERT INTO documentation.apartados (block_id, name, description, display_order, is_global)
SELECT b.id, v.name, NULL, v.display_order, false
FROM documentation.blocks b
CROSS JOIN (
  VALUES
    ('Informe CIRBE',                                  10),
    ('Cuadro de amortización de los préstamos',        20),
    ('Pool bancario, si estuviese disponible.',        30)
) AS v(name, display_order)
WHERE b.slug = 'deuda'
ON CONFLICT (block_id, name) DO NOTHING;

-- Contabilidad
INSERT INTO documentation.apartados (block_id, name, description, display_order, is_global)
SELECT b.id, v.name, NULL, v.display_order, false
FROM documentation.blocks b
CROSS JOIN (
  VALUES
    ('Cuentas Anuales Presentadas en Registro Mercantil',                                                                                            10),
    ('Libros registros de facturas emitidas y recibidas de los últimos cuatro años, más el ejercicio en curso.',                                     20),
    ('Avance contable del año en curso en formato Excel de los últimos 3 años (balance de situación, PYG, sumas y saldos, libro diario).',          30),
    ('Contabilidad oficial en formato Excel de los últimos 3 años (balance de situación, PYG, sumas y saldos, libro diario).',                       40),
    ('Activos y cuadro de amortización de activos.',                                                                                                  50)
) AS v(name, display_order)
WHERE b.slug = 'contabilidad'
ON CONFLICT (block_id, name) DO NOTHING;

-- Bancos
INSERT INTO documentation.apartados (block_id, name, description, display_order, is_global)
SELECT b.id, v.name, NULL, v.display_order, false
FROM documentation.blocks b
CROSS JOIN (
  VALUES
    ('Extractos bancarios del año en curso y año anterior', 10)
) AS v(name, display_order)
WHERE b.slug = 'bancos'
ON CONFLICT (block_id, name) DO NOTHING;

-- Datos societarios básicos y certificados
INSERT INTO documentation.apartados (block_id, name, description, display_order, is_global)
SELECT b.id, v.name, NULL, v.display_order, false
FROM documentation.blocks b
CROSS JOIN (
  VALUES
    ('Tarjeta NIF de la empresa en PDF',                                                       10),
    ('Certificado digital en formato PFX o P12, junto con su clave de instalación.',           20),
    ('Certificado de situación censal de la Agencia Tributaria',                               30),
    ('Certificado de estar al corriente con Hacienda',                                         40),
    ('Certificado de estar al corriente con la Seguridad Social',                              50)
) AS v(name, display_order)
WHERE b.slug = 'datos-societarios-basicos-y-certificados'
ON CONFLICT (block_id, name) DO NOTHING;

-- ENISA
INSERT INTO documentation.apartados (block_id, name, description, display_order, is_global)
SELECT b.id, v.name, NULL, v.display_order, false
FROM documentation.blocks b
CROSS JOIN (
  VALUES
    ('Modelo de declaración responsable', 10),
    ('Alta en el portal de ENISA',        20)
) AS v(name, display_order)
WHERE b.slug = 'enisa'
ON CONFLICT (block_id, name) DO NOTHING;

-- CFO
INSERT INTO documentation.apartados (block_id, name, description, display_order, is_global)
SELECT b.id, v.name, NULL, v.display_order, false
FROM documentation.blocks b
CROSS JOIN (
  VALUES
    ('Listado de competidores, directos o indirectos.',         10),
    ('Deck o presentación de la empresa, si está disponible.',  20),
    ('Previsiones de los próximos 4 años',                      30)
) AS v(name, display_order)
WHERE b.slug = 'cfo'
ON CONFLICT (block_id, name) DO NOTHING;

-- Laboral
INSERT INTO documentation.apartados (block_id, name, description, display_order, is_global)
SELECT b.id, v.name, NULL, v.display_order, false
FROM documentation.blocks b
CROSS JOIN (
  VALUES
    ('Nóminas de 2024.',                                                                                                10),
    ('Resúmenes de costes.',                                                                                            20),
    ('Contratos de trabajo.',                                                                                           30),
    ('Seguros sociales y ficheros CRA mes anterior',                                                                    40),
    ('Modelos 145 cumplimentados por trabajadores con sus circunstancias personales (se adjunta modelo)',               50),
    ('Cuestionario si es alta de empresa',                                                                              60)
) AS v(name, display_order)
WHERE b.slug = 'laboral'
ON CONFLICT (block_id, name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. apartado_departments — vincular cada apartado con sus departamentos.
--    Mapeo Excel → BD:
--      AS → asesoria-fiscal-y-contable
--      SU → financiacion-publica  (col "FIN PUB")
--      FI → finanzas              (col "CFO")
--      LA → asesoria-laboral
--      DA → data-tech
--      DI → diseno
-- ----------------------------------------------------------------------------

WITH pairs(block_slug, apartado_name, dept_slug) AS (
  VALUES
    -- Constitución y socios
    ('constitucion-y-socios', 'DNI de los socios en PDF, NIE o Pasaporte',                            'asesoria-fiscal-y-contable'),
    ('constitucion-y-socios', 'DNI de los socios en PDF, NIE o Pasaporte',                            'financiacion-publica'),
    ('constitucion-y-socios', 'DNI de los socios en PDF, NIE o Pasaporte',                            'finanzas'),
    ('constitucion-y-socios', 'Escritura de Acta Notarial de Manifestaciones sobre Titularidad Real', 'financiacion-publica'),
    ('constitucion-y-socios', 'Escrituras de Constitución inscritas en el Registro Mercantil',        'asesoria-fiscal-y-contable'),
    ('constitucion-y-socios', 'Escrituras de Constitución inscritas en el Registro Mercantil',        'financiacion-publica'),
    ('constitucion-y-socios', 'Escrituras de Constitución inscritas en el Registro Mercantil',        'finanzas'),
    ('constitucion-y-socios', 'Escrituras posteriores, si las hay.',                                  'asesoria-fiscal-y-contable'),
    ('constitucion-y-socios', 'Escrituras posteriores, si las hay.',                                  'financiacion-publica'),
    ('constitucion-y-socios', 'Escrituras posteriores, si las hay.',                                  'finanzas'),
    ('constitucion-y-socios', 'Captable, si estuviese disponible.',                                   'asesoria-fiscal-y-contable'),
    ('constitucion-y-socios', 'Captable, si estuviese disponible.',                                   'financiacion-publica'),
    ('constitucion-y-socios', 'Captable, si estuviese disponible.',                                   'finanzas'),

    -- Deuda
    ('deuda', 'Informe CIRBE',                            'asesoria-fiscal-y-contable'),
    ('deuda', 'Informe CIRBE',                            'financiacion-publica'),
    ('deuda', 'Informe CIRBE',                            'finanzas'),
    ('deuda', 'Cuadro de amortización de los préstamos',  'asesoria-fiscal-y-contable'),
    ('deuda', 'Cuadro de amortización de los préstamos',  'financiacion-publica'),
    ('deuda', 'Cuadro de amortización de los préstamos',  'finanzas'),
    ('deuda', 'Pool bancario, si estuviese disponible.',  'asesoria-fiscal-y-contable'),
    ('deuda', 'Pool bancario, si estuviese disponible.',  'financiacion-publica'),
    ('deuda', 'Pool bancario, si estuviese disponible.',  'finanzas'),

    -- Contabilidad
    ('contabilidad', 'Cuentas Anuales Presentadas en Registro Mercantil',                                                                                            'asesoria-fiscal-y-contable'),
    ('contabilidad', 'Cuentas Anuales Presentadas en Registro Mercantil',                                                                                            'financiacion-publica'),
    ('contabilidad', 'Cuentas Anuales Presentadas en Registro Mercantil',                                                                                            'finanzas'),
    ('contabilidad', 'Cuentas Anuales Presentadas en Registro Mercantil',                                                                                            'diseno'),
    ('contabilidad', 'Libros registros de facturas emitidas y recibidas de los últimos cuatro años, más el ejercicio en curso.',                                     'asesoria-fiscal-y-contable'),
    ('contabilidad', 'Libros registros de facturas emitidas y recibidas de los últimos cuatro años, más el ejercicio en curso.',                                     'financiacion-publica'),
    ('contabilidad', 'Libros registros de facturas emitidas y recibidas de los últimos cuatro años, más el ejercicio en curso.',                                     'finanzas'),
    ('contabilidad', 'Avance contable del año en curso en formato Excel de los últimos 3 años (balance de situación, PYG, sumas y saldos, libro diario).',          'asesoria-fiscal-y-contable'),
    ('contabilidad', 'Avance contable del año en curso en formato Excel de los últimos 3 años (balance de situación, PYG, sumas y saldos, libro diario).',          'financiacion-publica'),
    ('contabilidad', 'Avance contable del año en curso en formato Excel de los últimos 3 años (balance de situación, PYG, sumas y saldos, libro diario).',          'finanzas'),
    ('contabilidad', 'Contabilidad oficial en formato Excel de los últimos 3 años (balance de situación, PYG, sumas y saldos, libro diario).',                       'asesoria-fiscal-y-contable'),
    ('contabilidad', 'Contabilidad oficial en formato Excel de los últimos 3 años (balance de situación, PYG, sumas y saldos, libro diario).',                       'financiacion-publica'),
    ('contabilidad', 'Contabilidad oficial en formato Excel de los últimos 3 años (balance de situación, PYG, sumas y saldos, libro diario).',                       'finanzas'),
    ('contabilidad', 'Activos y cuadro de amortización de activos.',                                                                                                  'asesoria-fiscal-y-contable'),
    ('contabilidad', 'Activos y cuadro de amortización de activos.',                                                                                                  'financiacion-publica'),
    ('contabilidad', 'Activos y cuadro de amortización de activos.',                                                                                                  'finanzas'),

    -- Bancos
    ('bancos', 'Extractos bancarios del año en curso y año anterior', 'finanzas'),

    -- Datos societarios básicos y certificados
    ('datos-societarios-basicos-y-certificados', 'Tarjeta NIF de la empresa en PDF',                                              'financiacion-publica'),
    ('datos-societarios-basicos-y-certificados', 'Certificado digital en formato PFX o P12, junto con su clave de instalación.', 'asesoria-fiscal-y-contable'),
    ('datos-societarios-basicos-y-certificados', 'Certificado digital en formato PFX o P12, junto con su clave de instalación.', 'asesoria-laboral'),
    ('datos-societarios-basicos-y-certificados', 'Certificado de situación censal de la Agencia Tributaria',                     'asesoria-fiscal-y-contable'),
    ('datos-societarios-basicos-y-certificados', 'Certificado de situación censal de la Agencia Tributaria',                     'financiacion-publica'),
    ('datos-societarios-basicos-y-certificados', 'Certificado de situación censal de la Agencia Tributaria',                     'finanzas'),
    ('datos-societarios-basicos-y-certificados', 'Certificado de estar al corriente con Hacienda',                               'asesoria-fiscal-y-contable'),
    ('datos-societarios-basicos-y-certificados', 'Certificado de estar al corriente con Hacienda',                               'financiacion-publica'),
    ('datos-societarios-basicos-y-certificados', 'Certificado de estar al corriente con Hacienda',                               'finanzas'),
    ('datos-societarios-basicos-y-certificados', 'Certificado de estar al corriente con la Seguridad Social',                    'asesoria-fiscal-y-contable'),
    ('datos-societarios-basicos-y-certificados', 'Certificado de estar al corriente con la Seguridad Social',                    'financiacion-publica'),
    ('datos-societarios-basicos-y-certificados', 'Certificado de estar al corriente con la Seguridad Social',                    'finanzas'),

    -- ENISA
    ('enisa', 'Modelo de declaración responsable', 'financiacion-publica'),
    ('enisa', 'Alta en el portal de ENISA',        'financiacion-publica'),
    ('enisa', 'Alta en el portal de ENISA',        'finanzas'),

    -- CFO
    ('cfo', 'Listado de competidores, directos o indirectos.',         'finanzas'),
    ('cfo', 'Deck o presentación de la empresa, si está disponible.',  'asesoria-fiscal-y-contable'),
    ('cfo', 'Deck o presentación de la empresa, si está disponible.',  'financiacion-publica'),
    ('cfo', 'Deck o presentación de la empresa, si está disponible.',  'finanzas'),
    ('cfo', 'Deck o presentación de la empresa, si está disponible.',  'diseno'),
    ('cfo', 'Previsiones de los próximos 4 años',                      'finanzas'),
    ('cfo', 'Previsiones de los próximos 4 años',                      'diseno'),

    -- Laboral
    ('laboral', 'Nóminas de 2024.',                                                                                                'asesoria-laboral'),
    ('laboral', 'Resúmenes de costes.',                                                                                            'asesoria-laboral'),
    ('laboral', 'Contratos de trabajo.',                                                                                           'asesoria-laboral'),
    ('laboral', 'Seguros sociales y ficheros CRA mes anterior',                                                                    'asesoria-laboral'),
    ('laboral', 'Modelos 145 cumplimentados por trabajadores con sus circunstancias personales (se adjunta modelo)',               'asesoria-laboral'),
    ('laboral', 'Cuestionario si es alta de empresa',                                                                              'asesoria-laboral')
)
INSERT INTO documentation.apartado_departments (apartado_id, department_id)
SELECT a.id, d.id
FROM pairs p
JOIN documentation.blocks b   ON b.slug = p.block_slug
JOIN documentation.apartados a ON a.block_id = b.id AND a.name = p.apartado_name
JOIN public.departments d      ON d.slug = p.dept_slug
ON CONFLICT (apartado_id, department_id) DO NOTHING;
