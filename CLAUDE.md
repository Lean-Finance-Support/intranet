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
- El `/auth/callback` comprueba si existe `public.profiles` para el usuario:
  - Sin perfil → `/unauthorized`
  - role `admin` → `admin.leanfinance.es/dashboard`
  - role `client` → `app.leanfinance.es/dashboard`

---

## Base de datos (schema public)

### `public.profiles` — vinculada a auth.users (trigger automático al crear usuario)
- `id` uuid PK FK → auth.users.id
- `email` text
- `full_name` text (nullable)
- `role` enum('client','admin')
- `department` text (nullable — para admins)
- `company_id` uuid (nullable — FK → companies.id, para clientes)
- `created_at`, `updated_at` (timestamptz)

### `public.companies` — empresa cliente (N usuarios pueden pertenecer a una empresa)
- `id` uuid PK (gen_random_uuid)
- `company_name`, `nif`, `phone`, `address` (todos nullable)
- `created_at`, `updated_at`

### `public.admin_profiles` — extensión 1:1 con profiles para admins
- `id` uuid PK FK → profiles.id
- `created_at`, `updated_at`
- (campo `department` se eliminó — ahora vive en `profiles.department`)

---

## Estructura de rutas

```
app/app/login/page.tsx          → Login clientes (Google)
app/app/dashboard/page.tsx      → Dashboard clientes
app/admin/login/page.tsx        → Login empleados (Google)
app/admin/dashboard/page.tsx    → Dashboard empleados
app/auth/callback/route.ts      → OAuth callback (NO se reescribe por middleware)
app/unauthorized/page.tsx       → Sin acceso
middleware.ts                   → Routing por dominio + guard de auth + control de rol
lib/supabase/server.ts          → Cliente Supabase SSR
lib/supabase/client.ts          → Cliente Supabase browser
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
```

---

## Pendiente / próximos pasos

- Activar Google provider en Supabase (Client ID + Secret de Google Cloud)
- Añadir redirect URLs en Supabase: `https://app.leanfinance.es/auth/callback` y `https://admin.leanfinance.es/auth/callback`
- Añadir dominio `admin.leanfinance.es` en Vercel + CNAME en Dinahosting
- Añadir variables de entorno en Vercel
- Construir dashboards reales para ambos espacios
