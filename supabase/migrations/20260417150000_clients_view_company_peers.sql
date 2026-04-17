-- En el portal de clientes, la sección "Mi empresa" muestra las cuentas
-- asociadas a la empresa activa. La RLS original solo permitía a cada
-- cliente ver su propio `profile_companies` y su propio `profiles`, así
-- que el listado colapsaba a una sola fila (la del usuario actual).
--
-- Esta migración añade visibilidad lateral: un cliente puede ver los
-- vínculos y perfiles de otros usuarios que comparten alguna de SUS
-- empresas. No concede ningún permiso de escritura.
--
-- El lookup de "mis empresas" vive en una función SECURITY DEFINER para
-- romper la recursión de RLS (una policy sobre profile_companies que
-- vuelve a leer profile_companies hace que Postgres aborte con
-- "infinite recursion detected in policy").

CREATE OR REPLACE FUNCTION public.my_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.profile_companies
  WHERE profile_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_company_ids() TO authenticated;

CREATE POLICY profile_companies_select_peers ON public.profile_companies
  FOR SELECT
  USING (company_id IN (SELECT public.my_company_ids()));

CREATE POLICY clients_read_company_peers ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profile_companies pc
      WHERE pc.profile_id = profiles.id
        AND pc.company_id IN (SELECT public.my_company_ids())
    )
  );
