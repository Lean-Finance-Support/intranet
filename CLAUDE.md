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

**IMPORTANTE:** El trigger solo crea perfil si `raw_user_meta_data.role` está explícitamente presente.
Si alguien intenta logearse con una cuenta Google no dada de alta → `/unauthorized`.

---

## Base de datos (schema public)

### `public.profiles` — vinculada a auth.users (trigger automático al crear usuario)
- `id` uuid PK FK → auth.users.id
- `email` text
- `full_name` text (nullable)
- `role` enum('client','admin')
- `department` text (nullable — para admins)
- ~~`company_id`~~ eliminado — ahora se usa `profile_companies`
- `created_at`, `updated_at` (timestamptz)

### `public.profile_companies` — relación N:M entre profiles y companies
- `profile_id` uuid FK → profiles.id (ON DELETE CASCADE)
- `company_id` uuid FK → companies.id (ON DELETE CASCADE)
- `created_at` timestamptz
- PRIMARY KEY (profile_id, company_id)
- RLS: clientes ven solo las suyas, admins ven/escriben todo
- **Cookie `x-active-company-id`** almacena la empresa activa en sesión (7 días, httpOnly)
- Al login: 1 empresa → auto-setea cookie + va a /dashboard; N empresas → va a /select-company
- `profiles.company_id` se mantiene como campo legacy (nullable), ya no se usa en código

### `public.companies` — empresa cliente (N usuarios pueden pertenecer a una empresa)
- `id` uuid PK (gen_random_uuid)
- `legal_name` text NOT NULL — razón social / nombre legal (solo editable desde BD)
- `company_name` text nullable — nombre comercial (editable por admins desde admin.leanfinance.es)
- `nif`, `phone`, `address` (todos nullable)
- `created_at`, `updated_at`

### Trigger `handle_new_user`
Solo crea perfil si `NEW.raw_user_meta_data->>'role'` está presente.
Los logins de cuentas no pre-creadas por admin no generan perfil → van a /unauthorized.

---

## Estructura de rutas

```
app/app/login/page.tsx          → Login clientes (GIS popup o OAuth fallback)
app/app/select-company/         → Selector de empresa (si el cliente tiene varias)
app/app/dashboard/page.tsx      → Dashboard clientes
app/admin/login/page.tsx        → Login empleados (GIS popup o OAuth fallback)
app/admin/dashboard/page.tsx    → Dashboard empleados
app/auth/callback/route.ts      → OAuth callback fallback (NO se reescribe por middleware)
app/auth/verify/route.ts        → Verify para flujo GIS (NO se reescribe por middleware)
app/unauthorized/page.tsx       → Sin acceso
middleware.ts                   → Routing por dominio + guard de auth + control de rol
lib/supabase/server.ts          → Cliente Supabase SSR
lib/supabase/client.ts          → Cliente Supabase browser
lib/active-company.ts           → Helpers para cookie x-active-company-id
lib/require-client.ts           → Helper requireClient() para server actions de clientes
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
