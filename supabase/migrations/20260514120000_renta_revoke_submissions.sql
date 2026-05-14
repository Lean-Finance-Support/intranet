-- Permitir que un admin (chief, técnico asignado) revoque una submission
-- para que el familiar pueda volver a rellenar el formulario.
--
-- Diseño:
--   - Soft-delete: añadir revoked_at + revoked_by. La fila se conserva como
--     histórico (cliente puede tener varias submissions, solo una activa).
--   - El UNIQUE (invitation_id, authorized_filer_id) era global y bloqueaba
--     re-submit incluso si la anterior estaba revocada. Lo convertimos en
--     UNIQUE parcial: solo aplica a submissions NO revocadas.
--   - hasSubmissionForFiler / verifyDni filtran por revoked_at IS NULL para
--     que un DNI con su submission revocada vea el form como "no enviado aún".

ALTER TABLE renta.submissions
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoke_reason text;

-- Reemplazar UNIQUE global por UNIQUE parcial sobre submissions activas.
DROP INDEX IF EXISTS renta.submissions_one_per_filer_per_invitation;

CREATE UNIQUE INDEX submissions_one_active_per_filer_per_invitation
  ON renta.submissions (invitation_id, authorized_filer_id)
  WHERE revoked_at IS NULL;

COMMENT ON COLUMN renta.submissions.revoked_at IS
  'Si no es NULL, la submission ha sido revocada por un admin y el filer puede volver a rellenar el formulario.';
