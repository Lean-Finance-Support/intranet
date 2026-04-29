-- Seed del catálogo de documentación: bloque "Contratos" con dos apartados
-- globales: "Propuesta comercial" y "Tratamiento de datos".
-- Idempotente: ON CONFLICT sobre slug (block) y (block_id, name) (apartados).

INSERT INTO documentation.blocks (name, slug, description, display_order)
VALUES (
  'Contratos',
  'contratos',
  'Documentación contractual del cliente.',
  10
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO documentation.apartados (block_id, name, description, display_order, is_global)
SELECT b.id, v.name, v.description, v.display_order, true
FROM documentation.blocks b
CROSS JOIN (
  VALUES
    ('Propuesta comercial', NULL::text, 10),
    ('Tratamiento de datos', NULL::text, 20)
) AS v(name, description, display_order)
WHERE b.slug = 'contratos'
ON CONFLICT (block_id, name) DO NOTHING;
