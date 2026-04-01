# Memoria del Proyecto — Intranet LeanFinance

## Qué es este proyecto

Plataforma web con dos espacios diferenciados para LeanFinance (asesoría):

- **Portal de clientes** → `app.leanfinance.es` — acceso de empresas clientes y sus empleados
- **Portal de empleados** → `admin.leanfinance.es` — acceso del equipo interno de LeanFinance

Una única app Next.js sirve ambos dominios. El middleware detecta el host (`admin.` vs `app.`) y hace rewrite interno a `/admin/*` o `/app/*`.

---

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- Supabase (Auth + PostgreSQL) — proyecto ID: `wgxugccbatusioubnsfl`, región `eu-west-1`
- Vercel para despliegue — proyecto: `intranet` (team: `tech-2608s-projects`)
- GitHub: `Lean-Finance-Support/intranet`

---

## Autenticación

- **Solo Google OAuth** — no hay registro ni email/contraseña
- Los usuarios los crea manualmente un admin desde el panel de Supabase
- **Flujo preferido (GIS):** cuando `NEXT_PUBLIC_GOOGLE_CLIENT_ID` está configurado, se usa
  Google Identity Services con `signInWithIdToken` — abre popup de Google, sin redirigir a la URL de Supabase
- **Flujo fallback:** si no hay `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, se usa `signInWithOAuth`
  (la URL de Supabase aparece brevemente durante el redirect)
- El `/auth/callback` gestiona el flujo fallback (intercambia code por sesión)
- El `/auth/verify` gestiona el flujo GIS (verifica sesión ya establecida en cliente)
- Ambas rutas comprueban si existe `public.profiles`:
  - Sin perfil → signOut + `/unauthorized`
  - role `admin` → `admin.leanfinance.es/dashboard`
  - role `client` → `app.leanfinance.es/dashboard`

### Cómo crear un usuario (proceso manual)

1. Crear el usuario en Supabase Auth dashboard (email del usuario)
2. En "User Metadata" JSON del formulario, incluir: `{ "role": "admin" }` o `{ "role": "client" }`
3. El trigger `handle_new_user` creará automáticamente la fila en `public.profiles`
4. Si es client: crear fila(s) en `public.profile_companies` vinculando el profile con la(s) empresa(s)
5. Si es admin: crear fila(s) en `public.profile_departments` vinculando el profile con su(s) departamento(s)
6. Si es chief: crear fila(s) en `public.department_chiefs` vinculando el profile con el/los departamento(s) que lidera

**IMPORTANTE:** El trigger solo crea perfil si `raw_user_meta_data.role` está explícitamente presente.
Si alguien intenta logearse con una cuenta Google no dada de alta → `/unauthorized`.

---

## Base de datos (schema public)

### `public.profiles` — vinculada a auth.users (trigger automático al crear usuario)
- `id` uuid PK FK → auth.users.id
- `email` text
- `full_name` text (nullable)
- `role` enum('client','admin')
- ~~`department_id`~~ eliminado — se usa `profile_departments`
- ~~`company_id`~~ eliminado — se usa `profile_companies`
- `created_at`, `updated_at` (timestamptz)

### `public.profile_companies` — relación N:M entre profiles (clientes) y companies
- `profile_id` uuid FK → profiles.id (ON DELETE CASCADE)
- `company_id` uuid FK → companies.id (ON DELETE CASCADE)
- `created_at` timestamptz
- PRIMARY KEY (profile_id, company_id)
- RLS: clientes ven solo las suyas, admins ven/escriben todo
- **Cookie `x-active-company-id`** almacena la empresa activa en sesión (7 días, httpOnly)
- Al login: 1 empresa → auto-setea cookie + va a /dashboard; N empresas → va a /select-company

### `public.companies` — empresa cliente (N usuarios pueden pertenecer a una empresa)
- `id` uuid PK (gen_random_uuid)
- `legal_name` text NOT NULL — razón social / nombre legal (solo editable desde BD)
- `company_name` text nullable — nombre comercial (editable por admins desde admin.leanfinance.es)
- `nif`, `phone`, `address` (todos nullable)
- `created_at`, `updated_at`

### `public.departments` — departamentos de LeanFinance
- `id` uuid PK
- `name` text NOT NULL
- `slug` text UNIQUE NOT NULL
- ~~`chief_id`~~ eliminado — ahora se usa `department_chiefs`
- `created_at`

### `public.profile_departments` — relación N:M entre profiles (admins) y departments
- `profile_id` uuid FK → profiles.id (ON DELETE CASCADE)
- `department_id` uuid FK → departments.id (ON DELETE CASCADE)
- `created_at` timestamptz
- PRIMARY KEY (profile_id, department_id)
- **Cookie `x-active-department-id`** almacena el departamento activo en sesión (7 días, httpOnly)
- Al login: 1 departamento → auto-setea cookie + va a /dashboard; N departamentos → va a /select-department

### `public.department_chiefs` — relación N:M entre departments y profiles (jefes)
- `department_id` uuid FK → departments.id (ON DELETE CASCADE)
- `profile_id` uuid FK → profiles.id (ON DELETE CASCADE)
- `created_at` timestamptz
- PRIMARY KEY (department_id, profile_id)
- Un departamento puede tener varios chiefs; un admin puede ser chief de varios departamentos
- Los chiefs ven TODAS las empresas con servicios en su departamento

### `public.services` — servicios que ofrece LeanFinance
- `id` uuid PK
- `name` text NOT NULL
- `slug` text UNIQUE NOT NULL
- `created_at`

### `public.department_services` — relación N:M entre departments y services
- `department_id` uuid FK → departments.id
- `service_id` uuid FK → services.id
- PRIMARY KEY (department_id, service_id)

### `public.company_services` — servicios contratados por cada empresa
- `company_id` uuid FK → companies.id
- `service_id` uuid FK → services.id
- PRIMARY KEY (company_id, service_id)

### `public.company_technicians` — asignación de técnicos por empresa+servicio
- `id` uuid PK
- `company_id` uuid FK → companies.id (ON DELETE CASCADE)
- `service_id` uuid FK → services.id (ON DELETE CASCADE)
- `technician_id` uuid FK → profiles.id (ON DELETE CASCADE)
- `created_at` timestamptz
- UNIQUE (company_id, service_id, technician_id)
- Un técnico solo ve las empresas donde está asignado (por servicio)
- Se pueden asignar múltiples técnicos a un mismo company+service

### Modelo de permisos (admin)
- **No existe rol superadmin** — un "superadmin" es simplemente un admin que es chief de todos los departamentos
- **Técnico**: solo ve empresas donde está asignado como `company_technicians` para servicios del departamento activo
- **Chief**: ve TODAS las empresas que tienen servicios en su departamento
- La vista se filtra por departamento activo (cookie `x-active-department-id`)

### Trigger `handle_new_user`
Solo crea perfil si `NEW.raw_user_meta_data->>'role'` está presente.
Los logins de cuentas no pre-creadas por admin no generan perfil → van a /unauthorized.

---

## Estructura de rutas

```
app/app/login/page.tsx              → Login clientes (GIS popup o OAuth fallback)
app/app/select-company/             → Selector de empresa (si el cliente tiene varias)
app/app/dashboard/page.tsx          → Dashboard clientes
app/admin/login/page.tsx            → Login empleados (GIS popup o OAuth fallback)
app/admin/select-department/        → Selector de departamento (si el admin tiene varios)
app/admin/dashboard/page.tsx        → Dashboard empleados
app/admin/departamento/             → Vista de departamento activo (empresas, técnicos, servicios)
app/auth/callback/route.ts          → OAuth callback fallback (NO se reescribe por middleware)
app/auth/verify/route.ts            → Verify para flujo GIS (NO se reescribe por middleware)
app/unauthorized/page.tsx           → Sin acceso
middleware.ts                       → Routing por dominio + guard de auth + control de rol
lib/supabase/server.ts              → Cliente Supabase SSR
lib/supabase/client.ts              → Cliente Supabase browser
lib/active-company.ts               → Helpers para cookie x-active-company-id
lib/active-department.ts            → Helpers para cookie x-active-department-id
lib/require-client.ts               → Helper requireClient() para server actions de clientes
lib/require-admin.ts                → Helper requireAdmin() para server actions de admins
```

---

## Diseño visual

- Portal clientes: fondo `bg-surface-gray`, acentos `brand-teal`, tipografía `brand-navy`
- Portal admins: fondo `bg-brand-navy`, card blanca encima
- Logo: `https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png`
- En el portal admin el logo va con `brightness-0 invert` para que sea blanco

---

## Variables de entorno necesarias

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL=https://app.leanfinance.es
NEXT_PUBLIC_ADMIN_URL=https://admin.leanfinance.es
NEXT_PUBLIC_GOOGLE_CLIENT_ID      # Activa flujo GIS (sin URL de Supabase)
```

---

## Pendiente / próximos pasos

### Para activar el flujo GIS (eliminar URL de Supabase en producción)
1. En Google Cloud Console: crear OAuth 2.0 Client ID tipo "Web application"
2. Añadir en "Authorized JavaScript origins": `https://app.leanfinance.es`, `https://admin.leanfinance.es`, `http://localhost:3000`
3. Activar Google provider en Supabase Auth con ese Client ID + Client Secret
4. Añadir `NEXT_PUBLIC_GOOGLE_CLIENT_ID` en `.env.local` y en Vercel

### Para el despliegue en producción
5. Añadir redirect URLs en Supabase: `https://app.leanfinance.es/auth/callback` y `https://admin.leanfinance.es/auth/callback`
6. Desactivar "Enable Sign Ups" en Supabase → Auth → Settings (evita que cuentas no dadas de alta generen sesión)
7. Añadir dominio `admin.leanfinance.es` en Vercel + CNAME en Dinahosting
8. Añadir variables de entorno en Vercel

### Producto
9. Construir dashboards reales para ambos espacios
10. Panel de administración para gestionar usuarios y empresas
