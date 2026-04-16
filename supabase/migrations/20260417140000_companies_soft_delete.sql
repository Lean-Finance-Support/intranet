-- Soft delete para empresas. La eliminación marca `deleted_at` y la empresa
-- desaparece de listados y de cualquier otra pantalla que enumere empresas
-- (departamento, modelos, ENISA, portal cliente). Se conserva todo el
-- histórico fiscal/ENISA y las cuentas asociadas — solo deja de "existir"
-- a efectos operativos. Es reversible: UPDATE companies SET deleted_at = NULL.
--
-- Permisos:
--   - `delete_company` (NUEVO, scope none): permite marcar empresas como
--     eliminadas. Operación destructiva, asignable de forma más restrictiva.
--   - `create_company` (ya sembrado): cubre crear y RESTAURAR empresas
--     (dejar deleted_at = NULL).

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_companies_deleted_at ON public.companies (deleted_at);

INSERT INTO permissions (code, description, scope_type) VALUES
  ('delete_company',
   'Eliminar empresas (soft delete). Restaurar requiere create_company.',
   'none')
ON CONFLICT (code) DO NOTHING;
