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
5. Si es admin: asignarle el rol apropiado en `public.profile_roles`:
   - "Miembro de departamento" con scope `department` (para cada dept al que pertenezca)
   - "Chief" con scope `department` (si lidera) — incluye ya la pertenencia al dept
   - "Técnico" con scope `company_service` (para cada empresa+servicio que gestione)

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

### `public.profile_departments` — (legacy) relación admins ↔ departments
- La pertenencia a un departamento se resuelve ahora vía el permiso `member_of_department`
  (rol "Miembro de departamento" o "Chief") en `profile_roles`.
- La tabla se conserva por compatibilidad temporal; los consumidores nuevos deben leer desde
  `profile_roles` / `user_scope_ids`.
- **Cookie `x-active-department-id`** almacena el departamento activo en sesión (7 días, httpOnly).
  Al login: 1 departamento → auto-setea cookie + va a /dashboard; N departamentos → va a /select-department.

### `public.department_chiefs` — (legacy) chiefs de departamentos
- El rol "Chief" (en `profile_roles` con scope `department`) es la fuente de verdad.
- Se conserva por compatibilidad; los consumidores nuevos comprueban `has_permission(..., 'assign_technician', 'department', ...)`.

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

### `public.company_technicians` — (legacy) asignación de técnicos por empresa+servicio
- Se mantiene por compatibilidad con consumidores que aún la leen (listar técnicos de una empresa en la UI del dept).
- La fuente de verdad para autorización es ahora `profile_roles` con el rol "Técnico" y scope `company_service`.

### Sistema de permisos (admin)

Autorización basada en **permisos atómicos + roles**. Cada permiso declara qué `scope_type` admite
(`none` | `department` | `company` | `service` | `company_service`). Al asignar un rol o permiso a un
empleado se fija el scope concreto.

Tablas:
- `permissions` — catálogo (código, descripción, scope_type).
- `roles` — agrupaciones de permisos.
- `role_permissions` — qué permisos incluye cada rol.
- `profile_roles` — rol concedido a un empleado con scope concreto.
- `profile_permissions` — permiso suelto concedido directamente (excepcional).

Función central: `has_permission(uid, perm, scope_type default 'none', scope_id default NULL) returns bool`.
Helper para listar scopes: `user_scope_ids(uid, perm, scope_type) returns setof uuid`.

Roles semilla:
- **Miembro de departamento** — lectura básica (miembro, ver empresas/notificaciones del dept). Scope `department`.
- **Chief** — incluye "Miembro" + operaciones (asignar técnico, añadir servicio, crear notificaciones). Scope `department`.
- **Técnico** — `view_assigned_company` sobre una combinación empresa×servicio. Scope `company_service` (el `scope_id` referencia `company_services.id`).

Para escalada de privilegios: solo quien tenga el permiso `manage_users` puede escribir en las tablas
del propio sistema de permisos (RLS lo impone). Se bootstrapea manualmente por SQL o service role.

Evaluación desde app: helper `lib/require-permission.ts` (`requirePermission`, `hasPermission`,
`userScopeIds`). Las server actions llaman a `requirePermission(perm, scope)` antes de operar.
La RLS de las tablas de negocio sigue usando `is_admin(auth.uid())`/`is_client(auth.uid())` como
gate grueso — la autorización fina vive en los server actions.

La cookie `x-active-department-id` se puebla con los departamentos donde el usuario tiene
`member_of_department` (ver `getCachedUserDepartments`).

### Trigger `handle_new_user`
Solo crea perfil si `NEW.raw_user_meta_data->>'role'` está presente.
Los logins de cuentas no pre-creadas por admin no generan perfil → van a /unauthorized.

### Triggers de notificaciones (`trigger_notify_*`)
Trigger en `tax_notifications` llama a edge functions via `net.http_post`. La URL del proyecto y el `webhook_secret` se leen de `public.app_settings` (no hardcoded) para que la misma migración funcione en dev y prod.

---

## Pipeline de migraciones Supabase

`supabase/` es la fuente de verdad del schema y las edge functions. Ver `supabase/README.md` para detalles.

- **Migraciones**: `supabase/migrations/YYYYMMDDhhmmss_<slug>.sql`. Aplicar con `supabase db push` (usa management API, solo necesita `SUPABASE_ACCESS_TOKEN`). Nunca tocar schema desde el dashboard.
- **Edge functions**: `supabase/functions/<slug>/index.ts`. Deploy con `supabase functions deploy <slug> --project-ref <ref>`.
- **Config por entorno**: tras aplicar migraciones en un proyecto nuevo, insertar en `public.app_settings` la `supabase_url` y `webhook_secret`. Secrets de edge functions (`RESEND_API_KEY`, `WEBHOOK_SECRET`) via `supabase secrets set`.
- **pg_net**: debe estar instalado (la migración `20260414120100_parametrize_notifications.sql` lo crea). Sin él los triggers de notificación fallan con "schema 'net' does not exist".

Proyectos: prod `wgxugccbatusioubnsfl` (eu-west-1), dev `rvnflidcbiinmlfpzsbf` (eu-north-1). Plan Free → sin Supabase Branches.

---

## Backups de la base de datos

`pg_dump` diario cifrado a Cloudflare R2 + verificación semanal en contenedor efímero. Detalle, secrets y procedimiento de restore en `docs/backups.md`.

- Workflow diario: `.github/workflows/backup-db.yml` (03:00 UTC, schemas `public` + `auth` + `storage`).
- Workflow de verificación: `.github/workflows/backup-restore-test.yml` (domingos 05:00 UTC).
- Script de restore manual: `scripts/restore-backup.sh`.
- Bucket: `leanfinance-db-backups` (retención: 30 días `daily/`, 180 días `monthly/`).

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
