# Plan: Multi-Company Support for Client Profiles

- **Goal:** Permitir que un perfil de cliente esté asociado a múltiples empresas, con selector al login y switcher en el sidebar.
- **Architecture:** Supabase (DB + Auth), Next.js App Router, middleware de dominio, server actions, cookies HTTP-only.
- **Tech stack:** Next.js 15, Supabase, TypeScript, Tailwind CSS 4
- **Date:** 2026-03-25

---

## Cambio de modelo de datos

**Antes:** `profiles.company_id` → FK 1:1 a `companies`
**Después:** tabla junction `profile_companies (profile_id, company_id)` → N:M

La cookie `x-active-company-id` almacena la empresa activa en la sesión.

---

## File Map

```
supabase/migrations/            → SQL: crear profile_companies, migrar datos, RLS
lib/active-company.ts           → helpers para leer/escribir cookie x-active-company-id
app/app/select-company/
  page.tsx                      → página de selección de empresa (fuera del sidebar)
  actions.ts                    → getMyCompanies(), setActiveCompany(companyId)
app/auth/verify/route.ts        → MODIFICAR: redirigir a select-company si >1 empresa
app/auth/callback/route.ts      → MODIFICAR: ídem
middleware.ts                   → MODIFICAR: permitir /select-company, validar cookie
app/app/(sidebar)/layout.tsx    → MODIFICAR: leer empresa activa, pasar lista al sidebar
components/sidebar/client-sidebar.tsx → MODIFICAR: añadir company switcher arriba
app/app/empresa/actions.ts      → MODIFICAR: requireClient() usa cookie en vez de profiles.company_id
app/app/(sidebar)/modelos/actions.ts → MODIFICAR: ídem
```

---

## SQL Migration

```sql
-- 1. Crear tabla junction
CREATE TABLE IF NOT EXISTS public.profile_companies (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, company_id)
);

-- 2. RLS
ALTER TABLE public.profile_companies ENABLE ROW LEVEL SECURITY;

-- Clientes pueden ver sus propias asociaciones
CREATE POLICY "profile_companies_select_own" ON public.profile_companies
  FOR SELECT USING (auth.uid() = profile_id);

-- Admins pueden leer todo
CREATE POLICY "profile_companies_admin_select" ON public.profile_companies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

-- Admins pueden escribir
CREATE POLICY "profile_companies_admin_all" ON public.profile_companies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

-- 3. Migrar datos existentes
INSERT INTO public.profile_companies (profile_id, company_id)
SELECT id, company_id
FROM public.profiles
WHERE company_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

> Nota: `profiles.company_id` se mantiene por ahora como campo legacy (nullable).
> Se puede eliminar en una migración futura una vez validado todo.

---

## Flujo de la cookie activa

1. **Login exitoso (1 empresa):** auth/verify o auth/callback setean `x-active-company-id` y redirigen a `/dashboard`
2. **Login exitoso (N empresas):** redirigen a `/select-company`
3. **Página select-company:** muestra lista, al elegir llama a `setActiveCompany()` (server action) que setea la cookie y redirige a `/dashboard`
4. **Sidebar switcher:** llama a `setActiveCompany()` también (misma action)
5. **Server actions (requireClient):** leen cookie `x-active-company-id`, verifican que el usuario tiene acceso en `profile_companies`

---

## Tareas

### 0. SQL (ejecutar manualmente en Supabase)
- [ ] Proveer SQL al usuario para ejecutar en el dashboard de Supabase

### 1. lib/active-company.ts
- [ ] `getActiveCompanyId()`: lee cookie desde next/headers (server)
- [ ] `setActiveCompanyCookie(res, id)`: helper para route handlers

### 2. app/app/select-company/actions.ts
- [ ] `getMyCompanies()`: consulta profile_companies + companies para el user actual
- [ ] `setActiveCompany(companyId)`: valida acceso, setea cookie, redirige a dashboard

### 3. app/app/select-company/page.tsx
- [ ] Llama a `getMyCompanies()`, renderiza cards de empresa
- [ ] Si 0 empresas → /unauthorized; si 1 → auto-selecciona y redirige

### 4. auth/verify/route.ts + auth/callback/route.ts
- [ ] Para role client: consultar profile_companies
  - 0 empresas → /unauthorized
  - 1 empresa → setear cookie + /dashboard
  - N empresas → /select-company

### 5. middleware.ts
- [ ] Añadir `/select-company` (y `/app/select-company`) al bypass de auth
  (La página ya requiere sesión, pero no necesita empresa activa)

### 6. app/app/(sidebar)/layout.tsx
- [ ] Leer `x-active-company-id` cookie
- [ ] Fetch `profile_companies` para obtener lista de todas las empresas del user
- [ ] Pasar `companies[]` y `activeCompanyId` al sidebar

### 7. components/sidebar/client-sidebar.tsx
- [ ] Añadir prop `companies: {id, name}[]` y `activeCompanyId: string`
- [ ] Arriba del nav: mostrar empresa activa
- [ ] Si companies.length > 1: dropdown/botón para switchear (llama a setActiveCompany)

### 8. requireClient() en actions
- [ ] `app/app/empresa/actions.ts`: usar `getActiveCompanyId()` + verificar en profile_companies
- [ ] `app/app/(sidebar)/modelos/actions.ts`: ídem
