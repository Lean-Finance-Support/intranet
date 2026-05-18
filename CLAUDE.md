# Memoria del Proyecto — Intranet LeanFinance

## Qué es este proyecto

Plataforma web con dos espacios para LeanFinance (asesoría):

- **Portal de clientes** → `app.leanfinance.es` — empresas clientes y sus empleados
- **Portal de empleados** → `admin.leanfinance.es` — equipo interno de LeanFinance

Una única app Next.js sirve ambos dominios. El middleware detecta el host (`admin.` vs `app.`) y hace rewrite interno a `/admin/*` o `/app/*`.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- Supabase (Auth + PostgreSQL) — prod ID `wgxugccbatusioubnsfl` (eu-west-1), dev ID `rvnflidcbiinmlfpzsbf` (eu-north-1)
- Vercel — proyecto `intranet` (team `tech-2608s-projects`)
- GitHub: `Lean-Finance-Support/intranet`

## Documentación detallada (`docs/`)

CLAUDE.md es un mapa. El detalle por feature vive en `docs/` — léelo al tocar esa área:

- `docs/architecture.md` — arquitectura, routing por dominio, flujo de auth completo
- `docs/backups.md` — pg_dump diario cifrado a Cloudflare R2 + verificación semanal, restore
- `docs/dashboard-setup.md` — setup operativo y troubleshooting del Dashboard fiscal
- `docs/features/permisos.md` — sistema de permisos atómicos + roles
- `docs/features/catalogo-servicios.md` — catálogo global de servicios (`/admin/servicios`)
- `docs/features/onboarding.md` — wizard de alta de cliente (4 pasos)
- `docs/features/equipo-responsable.md` — `company_team_members`, invariantes, hooks de siembra
- `docs/features/documentacion.md` — schema `documentation`, apartados validables, kind='form'
- `docs/features/dashboard-fiscal.md` — servicio `dashboard`, lectura de Google Sheets
- `docs/features/declaracion-renta.md` — servicio `declaracion-renta`, formulario público, 349 deducciones
- `docs/features/buscador-global.md` — paleta Cmd/Ctrl+K **(incluye checklist de mantenimiento obligatorio)**
- `supabase/README.md` — pipeline de migraciones y edge functions

## Autenticación

- **Solo Google OAuth** — no hay registro ni email/contraseña. Los usuarios los crea manualmente un admin desde Supabase.
- **Flujo GIS (preferido):** con `NEXT_PUBLIC_GOOGLE_CLIENT_ID` se usa Google Identity Services + `signInWithIdToken` (popup, sin redirigir a Supabase). `/auth/verify` verifica la sesión ya establecida.
- **Flujo fallback:** sin esa env var se usa `signInWithOAuth`. `/auth/callback` intercambia code por sesión.
- Ambas rutas comprueban `public.profiles`: sin perfil → signOut + `/unauthorized`; `admin` → `admin.leanfinance.es/dashboard`; `client` → `app.leanfinance.es/dashboard`.

### Cómo crear un usuario (proceso manual)

1. Crear el usuario en Supabase Auth dashboard.
2. En "User Metadata" JSON incluir `{ "role": "admin" }` o `{ "role": "client" }`.
3. El trigger `handle_new_user` crea la fila en `public.profiles` **solo si `raw_user_meta_data.role` está presente** (logins de cuentas no dadas de alta → `/unauthorized`).
4. Si es client: crear fila(s) en `public.profile_companies`.
5. Si es admin: asignar rol en `public.profile_roles` (Miembro/Chief con scope `department`; Técnico con scope `company_service`). Ver `docs/features/permisos.md`.

## Base de datos (schema `public`)

### Tablas núcleo

- **`profiles`** — vinculada 1:1 a `auth.users` (trigger automático). `id`, `email`, `full_name`, `role` enum('client','admin'), timestamps. No tiene `department_id` ni `company_id` (se usan tablas N:M).
- **`companies`** — empresa cliente. `legal_name` (razón social, solo editable desde BD), `company_name` (nombre comercial, editable por admins), `nif`, `phone`, `address`.
- **`profile_companies`** — N:M profiles(clientes)↔companies. Cookie `x-active-company-id` (httpOnly, 7 días) almacena la empresa activa; al login 1 empresa → auto-cookie + `/dashboard`, N → `/select-company`.
- **`departments`** — `name`, `slug` UNIQUE. **`services`** — `name`, `slug` UNIQUE.
- **`department_services`** — N:M departments↔services. **`company_services`** — servicios contratados por empresa.
- **`company_team_members`** — equipo responsable de cada cliente (fuente de verdad). Ver `docs/features/equipo-responsable.md`.

### Tablas legacy (conservadas por compatibilidad, no usar en código nuevo)

- `profile_departments` — pertenencia a dpto; ahora vía permiso `member_of_department` en `profile_roles`. Cookie `x-active-department-id` (1 dpto → auto; N → `/select-department`).
- `department_chiefs` — chiefs; ahora el rol "Chief" en `profile_roles`.
- `company_technicians` — asignación de técnicos; ahora rol "Técnico" en `profile_roles`.

### Permisos

Autorización por permisos atómicos + roles. Función central `has_permission(...)`, helper app `lib/require-permission.ts`. Detalle completo en `docs/features/permisos.md`.

### Triggers

- `handle_new_user` — crea perfil solo si `raw_user_meta_data.role` está presente.
- `trigger_notify_*` en `tax_notifications` — llama a edge functions vía `net.http_post`; URL y `webhook_secret` se leen de `public.app_settings` (no hardcoded). Requiere `pg_net` instalado.

## Pipeline de migraciones Supabase

`supabase/` es la fuente de verdad del schema y las edge functions. Ver `supabase/README.md`.

- **Migraciones**: `supabase/migrations/YYYYMMDDhhmmss_<slug>.sql`. Aplicar con `supabase db push` (management API, solo necesita `SUPABASE_ACCESS_TOKEN`). Nunca tocar schema desde el dashboard.
- **GRANTs (desde 30-oct-2026)**: toda `create table public.<x>` nueva requiere GRANT explícito a `authenticated` y `service_role` (y `anon` si aplica) — sin ello la Data API la oculta. Patrón en `supabase/README.md`.
- **Edge functions**: `supabase/functions/<slug>/index.ts`. Deploy con `supabase functions deploy <slug> --project-ref <ref>`.
- **Schemas no-public** (`documentation`, `dashboard`, `renta`): deben añadirse a "Exposed schemas" en Supabase Dashboard → API Settings (una vez por proyecto), o el SDK devuelve 404.
- **Seeds**: editar el contenido de un seed ya aplicado NO lo re-ejecuta; crear migración nueva con timestamp posterior.
- Plan Free → sin Supabase Branches.

## Estructura de rutas

```
app/app/login|select-company|dashboard      → portal clientes
app/admin/login|select-department|dashboard  → portal empleados
app/admin/clientes/onboarding/               → wizard de alta de cliente
app/admin/departamento/                      → vista de departamento activo
app/renta/[token]/                           → formulario público de renta (fuera de admin/app)
app/auth/callback/route.ts                   → OAuth callback fallback (no reescrito por middleware)
app/auth/verify/route.ts                     → verify para flujo GIS (no reescrito por middleware)
app/unauthorized/                            → sin acceso
middleware.ts                                → routing por dominio + guard de auth + control de rol
lib/supabase/{server,client}.ts              → clientes Supabase SSR / browser
lib/active-company.ts / lib/active-department.ts → helpers de cookies de sesión
lib/require-client.ts / lib/require-admin.ts / lib/require-permission.ts → guards de server actions
```

**Nunca hardcodear hrefs/redirects con `/admin/` o `/app/`** — usar `getLinkPrefix(space)` (vacío en prod, prefijado en dev).

## Diseño visual

- Portal clientes: fondo `bg-surface-gray`, acentos `brand-teal`, tipografía `brand-navy`.
- Portal admins: fondo `bg-brand-navy`, card blanca encima.
- Logo: `https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png` (con `brightness-0 invert` en el portal admin).
- La marca en UI/emails se escribe **"Lean Finance"** con espacio.

## Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL=https://app.leanfinance.es
NEXT_PUBLIC_ADMIN_URL=https://admin.leanfinance.es
NEXT_PUBLIC_GOOGLE_CLIENT_ID      # activa flujo GIS
ENISA_ENCRYPTION_KEY              # 32 bytes base64, distinta por entorno, backup en 1Password
WEBHOOK_SECRET                    # mismo valor en Next y en edge functions
GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REFRESH_TOKEN   # Dashboard fiscal
```

## Pendiente / próximos pasos

- **Flujo GIS en prod**: crear OAuth Client "Web application" en Google Cloud, registrar JS origins, activar provider Google en Supabase, añadir `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- **Deploy prod**: redirect URLs en Supabase, desactivar "Enable Sign Ups", dominio `admin.leanfinance.es` en Vercel + CNAME, env vars en Vercel.
- **Producto**: dashboards reales para ambos espacios; panel de administración de usuarios y empresas.
