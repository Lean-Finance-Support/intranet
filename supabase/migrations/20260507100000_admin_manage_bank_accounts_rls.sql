-- La regresión introducida en 20260415084000_drop_superadmin_role.sql dejó solo
-- la policy admins_read_bank_accounts (FOR SELECT) en company_bank_accounts.
-- Cualquier INSERT/UPDATE/DELETE de un admin (p.ej. addCompanyBankAccountAdmin)
-- era rechazado por RLS y la app lo enmascaraba como "Error al añadir la
-- cuenta bancaria.". La autorización fina la sigue aplicando
-- requirePermission('manage_bank_accounts') en el server action.

DROP POLICY IF EXISTS admins_read_bank_accounts ON public.company_bank_accounts;

CREATE POLICY admins_manage_bank_accounts ON public.company_bank_accounts
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
