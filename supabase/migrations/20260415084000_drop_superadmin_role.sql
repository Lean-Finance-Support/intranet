-- Fase 5: retira el valor 'superadmin' del enum public.user_role.
-- Precondición: no existen filas en profiles con role='superadmin'.
--
-- PG no permite alterar el tipo de una columna mientras policies la referencian
-- con literales casteados al enum viejo. Estrategia:
--   1. Recrear is_admin() sin 'superadmin' + introducir is_client() helper.
--   2. Droppear todas las policies que referencian 'superadmin'::user_role o 'client'::user_role.
--   3. Crear policies equivalentes usando los helpers (sin literales del enum).
--   4. Recambiar el enum.

SET search_path = public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE role::text = 'superadmin') THEN
    RAISE EXCEPTION 'Hay profiles con role=superadmin; no se puede reducir el enum';
  END IF;
END $$;

--
-- 1. Helpers
--
CREATE OR REPLACE FUNCTION is_admin(user_id uuid) RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM profiles WHERE id = user_id AND role::text = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION is_client(user_id uuid) RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM profiles WHERE id = user_id AND role::text = 'client'
    );
$$;

--
-- 2. Drop policies que referencian user_role directamente
--
DROP POLICY IF EXISTS "Admins can manage companies" ON companies;
DROP POLICY IF EXISTS admins_read_companies ON companies;
DROP POLICY IF EXISTS admins_read_bank_accounts ON company_bank_accounts;
DROP POLICY IF EXISTS clients_manage_own_bank_accounts ON company_bank_accounts;
DROP POLICY IF EXISTS admins_all_company_services ON company_services;
DROP POLICY IF EXISTS admins_read_company_services ON company_services;
DROP POLICY IF EXISTS clients_read_own_company_services ON company_services;
DROP POLICY IF EXISTS company_technicians_admin_select ON company_technicians;
DROP POLICY IF EXISTS department_chiefs_admin_select ON department_chiefs;
DROP POLICY IF EXISTS admins_all_department_services ON department_services;
DROP POLICY IF EXISTS admins_read_department_services ON department_services;
DROP POLICY IF EXISTS admins_read_own_department_services ON department_services;
DROP POLICY IF EXISTS admins_all_departments ON departments;
DROP POLICY IF EXISTS clients_read_departments ON departments;
DROP POLICY IF EXISTS admins_manage_reviews ON enisa_box_reviews;
DROP POLICY IF EXISTS admins_read_all_credentials ON enisa_credentials;
DROP POLICY IF EXISTS admins_read_all_enisa_docs ON enisa_documents;
DROP POLICY IF EXISTS admins_manage_welcome ON enisa_notifications;
DROP POLICY IF EXISTS admins_read_all_submissions ON enisa_submissions;
DROP POLICY IF EXISTS admins_create_notifications ON notifications;
DROP POLICY IF EXISTS clients_create_notifications ON notifications;
DROP POLICY IF EXISTS profile_companies_admin_all ON profile_companies;
DROP POLICY IF EXISTS profile_companies_admin_select ON profile_companies;
DROP POLICY IF EXISTS profile_departments_admin_select ON profile_departments;
DROP POLICY IF EXISTS admins_all_services ON services;
DROP POLICY IF EXISTS admins_read_services ON services;
DROP POLICY IF EXISTS clients_read_active_services ON services;
DROP POLICY IF EXISTS admins_read_responses ON tax_client_responses;
DROP POLICY IF EXISTS clients_manage_own_responses ON tax_client_responses;
DROP POLICY IF EXISTS admins_read_submissions ON tax_client_submissions;
DROP POLICY IF EXISTS clients_manage_own_submissions ON tax_client_submissions;
DROP POLICY IF EXISTS "Admins manage tax_entries" ON tax_entries;
DROP POLICY IF EXISTS "Admins manage tax_notifications" ON tax_notifications;
DROP POLICY IF EXISTS clients_read_own_notifications ON tax_notifications;
DROP POLICY IF EXISTS "Admins manage tax_quarter_comments" ON tax_quarter_comments;

--
-- 3. Recrear policies sin referenciar user_role directamente
--

-- companies
CREATE POLICY "Admins can manage companies" ON companies
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY admins_read_companies ON companies
  FOR SELECT USING (is_admin(auth.uid()));

-- company_bank_accounts
CREATE POLICY admins_read_bank_accounts ON company_bank_accounts
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY clients_manage_own_bank_accounts ON company_bank_accounts
  FOR ALL USING (
    is_client(auth.uid()) AND EXISTS (
      SELECT 1 FROM profile_companies pc
      WHERE pc.profile_id = auth.uid()
        AND pc.company_id = company_bank_accounts.company_id
    )
  ) WITH CHECK (
    is_client(auth.uid()) AND EXISTS (
      SELECT 1 FROM profile_companies pc
      WHERE pc.profile_id = auth.uid()
        AND pc.company_id = company_bank_accounts.company_id
    )
  );

-- company_services
CREATE POLICY admins_all_company_services ON company_services
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY admins_read_company_services ON company_services
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY clients_read_own_company_services ON company_services
  FOR SELECT USING (
    is_active = true AND is_client(auth.uid()) AND EXISTS (
      SELECT 1 FROM profile_companies pc
      WHERE pc.profile_id = auth.uid()
        AND pc.company_id = company_services.company_id
    )
  );

-- company_technicians
CREATE POLICY company_technicians_admin_select ON company_technicians
  FOR SELECT USING (is_admin(auth.uid()));

-- department_chiefs
CREATE POLICY department_chiefs_admin_select ON department_chiefs
  FOR SELECT USING (is_admin(auth.uid()));

-- department_services
CREATE POLICY admins_all_department_services ON department_services
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY admins_read_department_services ON department_services
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY admins_read_own_department_services ON department_services
  FOR SELECT USING (is_admin(auth.uid()));

-- departments
CREATE POLICY admins_all_departments ON departments
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY clients_read_departments ON departments
  FOR SELECT TO authenticated USING (is_client(auth.uid()));

-- enisa_*
CREATE POLICY admins_manage_reviews ON enisa_box_reviews
  FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY admins_read_all_credentials ON enisa_credentials
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY admins_read_all_enisa_docs ON enisa_documents
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY admins_manage_welcome ON enisa_notifications
  FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY admins_read_all_submissions ON enisa_submissions
  FOR SELECT USING (is_admin(auth.uid()));

-- notifications
CREATE POLICY admins_create_notifications ON notifications
  FOR INSERT TO authenticated WITH CHECK (
    is_admin(auth.uid()) AND EXISTS (
      SELECT 1 FROM profiles WHERE id = notifications.recipient_id
    )
  );
CREATE POLICY clients_create_notifications ON notifications
  FOR INSERT TO authenticated WITH CHECK (
    is_client(auth.uid()) AND is_admin(notifications.recipient_id)
  );

-- profile_companies
CREATE POLICY profile_companies_admin_all ON profile_companies
  FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY profile_companies_admin_select ON profile_companies
  FOR SELECT USING (is_admin(auth.uid()));

-- profile_departments
CREATE POLICY profile_departments_admin_select ON profile_departments
  FOR SELECT USING (is_admin(auth.uid()));

-- services
CREATE POLICY admins_all_services ON services
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY admins_read_services ON services
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY clients_read_active_services ON services
  FOR SELECT TO authenticated USING (is_active = true AND is_client(auth.uid()));

-- tax_client_responses
CREATE POLICY admins_read_responses ON tax_client_responses
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY clients_manage_own_responses ON tax_client_responses
  FOR ALL USING (
    is_client(auth.uid()) AND EXISTS (
      SELECT 1 FROM tax_entries te
      JOIN profile_companies pc ON pc.company_id = te.company_id
      WHERE te.id = tax_client_responses.tax_entry_id
        AND pc.profile_id = auth.uid()
    )
  ) WITH CHECK (
    is_client(auth.uid()) AND EXISTS (
      SELECT 1 FROM tax_entries te
      JOIN profile_companies pc ON pc.company_id = te.company_id
      WHERE te.id = tax_client_responses.tax_entry_id
        AND pc.profile_id = auth.uid()
    )
  );

-- tax_client_submissions
CREATE POLICY admins_read_submissions ON tax_client_submissions
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY clients_manage_own_submissions ON tax_client_submissions
  FOR ALL USING (
    is_client(auth.uid()) AND EXISTS (
      SELECT 1 FROM profile_companies pc
      WHERE pc.profile_id = auth.uid()
        AND pc.company_id = tax_client_submissions.company_id
    )
  ) WITH CHECK (
    is_client(auth.uid()) AND EXISTS (
      SELECT 1 FROM profile_companies pc
      WHERE pc.profile_id = auth.uid()
        AND pc.company_id = tax_client_submissions.company_id
    )
  );

-- tax_entries
CREATE POLICY "Admins manage tax_entries" ON tax_entries
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- tax_notifications
CREATE POLICY "Admins manage tax_notifications" ON tax_notifications
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY clients_read_own_notifications ON tax_notifications
  FOR SELECT USING (
    is_client(auth.uid()) AND EXISTS (
      SELECT 1 FROM profile_companies pc
      WHERE pc.profile_id = auth.uid()
        AND pc.company_id = tax_notifications.company_id
    )
  );

-- tax_quarter_comments
CREATE POLICY "Admins manage tax_quarter_comments" ON tax_quarter_comments
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

--
-- 4. Sustituir el enum
--
CREATE TYPE user_role_new AS ENUM ('client', 'admin');

ALTER TABLE profiles
  ALTER COLUMN role DROP DEFAULT,
  ALTER COLUMN role TYPE user_role_new USING role::text::user_role_new;

DROP TYPE user_role;
ALTER TYPE user_role_new RENAME TO user_role;

--
-- 5. Rematar: is_admin / is_client ahora sin el cast a text
--
CREATE OR REPLACE FUNCTION is_admin(user_id uuid) RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM profiles WHERE id = user_id AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION is_client(user_id uuid) RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM profiles WHERE id = user_id AND role = 'client'
    );
$$;
