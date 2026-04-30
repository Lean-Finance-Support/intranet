-- Hace `validate_documentation` delegable (N1/N2/N3). Sigue formando parte del
-- rol Chief, pero ahora también se puede otorgar como grant suelto desde la UI
-- de gestión de permisos para casos de coordinadores transversales.

SET search_path = public;

UPDATE permissions
   SET is_grantable = true
 WHERE code = 'validate_documentation';

-- Bootstrap N3 a tech@leanfinance.es para poder delegar el permiso desde la UI.
DO $$
DECLARE
  tech_id uuid;
BEGIN
  SELECT id INTO tech_id FROM profiles WHERE email = 'tech@leanfinance.es' LIMIT 1;
  IF tech_id IS NULL THEN
    RAISE NOTICE 'tech@leanfinance.es no encontrado; saltando bootstrap N3';
    RETURN;
  END IF;

  INSERT INTO profile_permissions (profile_id, permission_code, scope_type, scope_id, grant_level)
  VALUES (tech_id, 'validate_documentation', 'none', NULL, 3)
  ON CONFLICT ON CONSTRAINT profile_permissions_unique
    DO UPDATE SET grant_level = GREATEST(profile_permissions.grant_level, 3);
END $$;
