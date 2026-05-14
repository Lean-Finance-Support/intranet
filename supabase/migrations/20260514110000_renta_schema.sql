-- Schema "renta": formulario público de Declaración de la renta.
-- Cada empresa con el servicio 'declaracion-renta' contratado puede:
--   1. Mantener una lista de DNIs autorizados a rellenar el formulario.
--   2. Generar un link público (token) compartible con sus familiares.
--   3. Recibir N submissions (una por familiar) sin que estos tengan cuenta.
--
-- Decisiones clave:
--   - El "login" del form es DNI pre-autorizado (no email, no contraseña).
--   - DNI visible en plaintext para todos los admins (RLS admin-only suficiente).
--   - Single-shot por DNI: UNIQUE(invitation_id, authorized_filer_id).
--   - Catálogo de deducciones (~500 filas) es data-driven, SELECT público anon.
--
-- IMPORTANTE: añadir 'renta' a "Exposed schemas" en Supabase Dashboard
-- → Project Settings → API → Settings (una vez por proyecto). Sin esto el
-- SDK devuelve 404 al hacer .schema('renta').

CREATE SCHEMA IF NOT EXISTS renta;

GRANT USAGE ON SCHEMA renta TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA renta
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

-- =============================================================================
-- 1. Invitations — token público por empresa
-- =============================================================================

CREATE TABLE renta.invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'activa' CHECK (status IN ('activa', 'revocada', 'expirada')),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

-- Solo un link activo por empresa (parcial unique index).
CREATE UNIQUE INDEX invitations_one_active_per_company
  ON renta.invitations (company_id)
  WHERE status = 'activa';

CREATE INDEX invitations_token_idx ON renta.invitations (token);

COMMENT ON TABLE renta.invitations IS
  'Token público por empresa para el formulario de Declaración de la renta. UNIQUE parcial garantiza un único link activo por empresa.';

-- =============================================================================
-- 2. Authorized filers — lista blanca de DNIs por empresa
-- =============================================================================

CREATE TABLE renta.authorized_filers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dni         text NOT NULL,
  full_name   text NOT NULL,
  email       text,
  notes       text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authorized_filers_dni_normalized
    CHECK (dni = upper(btrim(dni)) AND dni !~ '\s')
);

CREATE UNIQUE INDEX authorized_filers_company_dni_uniq
  ON renta.authorized_filers (company_id, dni);

CREATE INDEX authorized_filers_company_idx ON renta.authorized_filers (company_id);

COMMENT ON TABLE renta.authorized_filers IS
  'Lista blanca de DNIs autorizados a rellenar el formulario por empresa. DNI normalizado (upper, sin espacios) por CHECK.';

-- =============================================================================
-- 3. Submissions — una fila por familiar
-- =============================================================================

CREATE TABLE renta.submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id         uuid NOT NULL REFERENCES renta.invitations(id) ON DELETE CASCADE,
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  authorized_filer_id   uuid NOT NULL REFERENCES renta.authorized_filers(id) ON DELETE RESTRICT,
  full_name             text NOT NULL,
  dni                   text NOT NULL,
  profile_response      jsonb NOT NULL,
  deductions_response   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                text NOT NULL DEFAULT 'pendiente'
                          CHECK (status IN ('pendiente', 'revisada')),
  admin_notes           text,
  submitted_ip          inet,
  submitted_user_agent  text,
  reviewed_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX submissions_one_per_filer_per_invitation
  ON renta.submissions (invitation_id, authorized_filer_id);

CREATE INDEX submissions_company_status_idx ON renta.submissions (company_id, status);
CREATE INDEX submissions_created_at_idx ON renta.submissions (created_at DESC);

COMMENT ON TABLE renta.submissions IS
  'Submission por familiar. Single-shot: UNIQUE(invitation_id, authorized_filer_id).';

-- =============================================================================
-- 4. Deductions — catálogo data-driven de las ~500 deducciones autonómicas
-- =============================================================================

CREATE TABLE renta.deductions (
  id                text PRIMARY KEY,            -- slug tipo "mad-alquiler-joven"
  ccaa_code         text NOT NULL,               -- ISO 3166-2:ES (ES-MD, ES-CT...)
  title             text NOT NULL,
  summary           text,
  legal_reference   text,
  eligibility_rule  jsonb NOT NULL DEFAULT '{"all_of":[]}'::jsonb,
  extra_fields      jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order     int NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deductions_ccaa_active_idx
  ON renta.deductions (ccaa_code, display_order)
  WHERE is_active;

COMMENT ON TABLE renta.deductions IS
  'Catálogo de deducciones autonómicas. eligibility_rule es JSON AST evaluado por lib/renta/rule-engine.ts.';

-- =============================================================================
-- 5. Rate limit — control de abuso del endpoint público
-- =============================================================================

CREATE TABLE renta.rate_limit (
  id     bigserial PRIMARY KEY,
  ip     inet,
  token  text,
  action text NOT NULL CHECK (action IN ('verify_dni', 'submit')),
  ts     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rate_limit_ip_ts_idx ON renta.rate_limit (ip, ts);
CREATE INDEX rate_limit_token_ts_idx ON renta.rate_limit (token, ts);

COMMENT ON TABLE renta.rate_limit IS
  'Eventos de rate-limit del endpoint público. Filas con ts > 1 día se borran al insertar nuevas.';

-- =============================================================================
-- 6. Trigger updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION renta.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER invitations_updated_at
  BEFORE UPDATE ON renta.invitations
  FOR EACH ROW EXECUTE FUNCTION renta.tg_set_updated_at();

CREATE TRIGGER authorized_filers_updated_at
  BEFORE UPDATE ON renta.authorized_filers
  FOR EACH ROW EXECUTE FUNCTION renta.tg_set_updated_at();

CREATE TRIGGER submissions_updated_at
  BEFORE UPDATE ON renta.submissions
  FOR EACH ROW EXECUTE FUNCTION renta.tg_set_updated_at();

CREATE TRIGGER deductions_updated_at
  BEFORE UPDATE ON renta.deductions
  FOR EACH ROW EXECUTE FUNCTION renta.tg_set_updated_at();

-- =============================================================================
-- 7. RLS
-- =============================================================================

ALTER TABLE renta.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE renta.authorized_filers ENABLE ROW LEVEL SECURITY;
ALTER TABLE renta.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE renta.deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE renta.rate_limit ENABLE ROW LEVEL SECURITY;

-- invitations: solo admins. INSERT/UPDATE/DELETE vía server actions (service_role bypasea RLS).
CREATE POLICY admins_select_invitations ON renta.invitations
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY admins_insert_invitations ON renta.invitations
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admins_update_invitations ON renta.invitations
  FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admins_delete_invitations ON renta.invitations
  FOR DELETE USING (public.is_admin(auth.uid()));

-- authorized_filers: solo admins. El lookup público se hace vía server action con service role.
CREATE POLICY admins_select_authorized_filers ON renta.authorized_filers
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY admins_insert_authorized_filers ON renta.authorized_filers
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admins_update_authorized_filers ON renta.authorized_filers
  FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admins_delete_authorized_filers ON renta.authorized_filers
  FOR DELETE USING (public.is_admin(auth.uid()));

-- submissions: solo admins leen/actualizan. INSERT exclusivamente con service_role
-- (lo hace la server action submitRenta tras validar token y rate-limit).
CREATE POLICY admins_select_submissions ON renta.submissions
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY admins_update_submissions ON renta.submissions
  FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admins_delete_submissions ON renta.submissions
  FOR DELETE USING (public.is_admin(auth.uid()));
-- NO INSERT policy: solo service_role puede insertar (bypass RLS).

-- deductions: SELECT abierto a todos (form público lo necesita). Mutaciones solo admin.
CREATE POLICY anyone_read_active_deductions ON renta.deductions
  FOR SELECT USING (is_active);
CREATE POLICY admins_select_all_deductions ON renta.deductions
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY admins_insert_deductions ON renta.deductions
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admins_update_deductions ON renta.deductions
  FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admins_delete_deductions ON renta.deductions
  FOR DELETE USING (public.is_admin(auth.uid()));

-- rate_limit: tabla interna sin acceso desde JWT alguno (solo service_role).
-- Sin policies = todo bloqueado para authenticated/anon.
