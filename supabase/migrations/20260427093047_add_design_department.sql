-- Añade el departamento "Diseño" al catálogo de departments.

INSERT INTO public.departments (name, slug)
VALUES ('Diseño', 'diseno')
ON CONFLICT (slug) DO NOTHING;
