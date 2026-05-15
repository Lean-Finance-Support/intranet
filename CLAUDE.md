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

### `public.company_team_members` — equipo responsable de cada cliente
- `company_id` uuid FK → companies.id (ON DELETE CASCADE)
- `profile_id` uuid FK → profiles.id (ON DELETE CASCADE)
- `added_at` timestamptz, `added_by` uuid FK → profiles.id (ON DELETE SET NULL)
- PRIMARY KEY (company_id, profile_id)
- RLS: lectura/escritura solo admins (`is_admin`); la autorización fina vive en los server actions.
- Fuente de verdad del equipo responsable. Ver sección "Equipo responsable (gestión post-onboarding)".

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
- **Supervisor de apartado** — `validate_client_documentation` sobre un `client_apartado` concreto. Scope `client_apartado` (el `scope_id` referencia `documentation.client_apartados.id`). No se asigna desde la UI de roles: se otorga/revoca al asignar/quitar a alguien como supervisor de un apartado de documentación.

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
- **GRANTs en `public` desde el 30-oct-2026**: cualquier `create table public.<x>` nueva requiere GRANT explícito a `authenticated` y `service_role` (y `anon` si aplica) — sin ello la Data API la oculta. Detalle y patrón en `supabase/README.md`. Tablas existentes no se ven afectadas.
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

## Catálogo de servicios

Listado global de los servicios que Lean Finance ofrece a sus clientes, gestionable desde `/admin/servicios`. La página es de **lectura libre para todos los admins**; las mutaciones (crear/editar/archivar) requieren el permiso atómico `manage_services_catalog` (global, grantable, sin pertenencia a roles — se concede manualmente vía `profile_permissions`).

- Tabla `public.services` (catálogo) + `public.department_services` (M:N) + `public.company_services` (contrataciones por empresa).
- Cardinalidad servicio↔dpto: 0..N (un servicio puede ser transversal sin dpto, tener uno o pertenecer a varios).
- Slugs `tax-models` y `dashboard` son **load-bearing** (referenciados en código por gates de sidebar y OAuth Dashboard). El catálogo bloquea editar el slug y archivar el servicio (flag `is_load_bearing` en `ServiceCatalogItem`, constante `LOAD_BEARING_SERVICE_SLUGS` en `lib/types/services.ts`).
- Server actions en `app/admin/(sidebar)/servicios/actions.ts` (`listServicesCatalog`, `createService`, `updateService`, `archiveService`, `unarchiveService`).

## Onboarding de cliente

Flujo de alta integral en `/admin/clientes/onboarding` (botón **"+ Nuevo onboarding"** debajo de "+ Nuevo cliente" en `/admin/clientes`). Wizard de 4 pasos:

1. **Datos** — datos básicos de empresa, cuentas bancarias (opcionales, solo si `manage_bank_accounts`), cuentas asociadas (≥1 obligatoria, con prebúsqueda por email tipo `findClientProfileByEmail` para vincular cuentas existentes).
2. **Equipo responsable** — selector de **servicios contratados** (no de departamentos; los dpts responsables se derivan vía `department_services`). Miembros del equipo por dpto derivado (≥1 por dpto). Dos checkboxes condicionales: "Cliente no viene de Holded" y "Solicita Alta de Empresa" (este último se habilita si algún servicio contratado pertenece a Asesoría Laboral). Si todos los servicios son transversales (sin dpto), el wizard avisa y permite seguir con solo documentación global.
3. **Documentación inicial** — listado editable de apartados sugeridos según los dpts derivados + tags. Permite añadir/quitar (bloque entero o apartado suelto), togglear opcional y editar supervisores agrupados por dpto.
4. **Confirmación** — resumen, finalización transaccional + email de bienvenida.

Acceso: requiere los 3 permisos `create_company` + `manage_client_accounts` + `request_client_documentation` (hoy solo concedidos manualmente vía `profile_permissions`; no hay rol que los aglutine).

Al finalizar, `finalizeOnboarding` inserta `company_services` para los servicios elegidos y, para cada miembro del equipo, inserta filas en `profile_roles`:
- Rol **Técnico** con `scope_type=company_service` para cada servicio del dpto del miembro.
- Rol **Supervisor de apartado** con `scope_type=client_apartado` para los apartados del cliente vinculados al dpto del miembro.

Server actions: `app/admin/(sidebar)/clientes/onboarding/actions.ts` (`getOnboardingData`, `lookupExistingClientByEmail`, `finalizeOnboarding`).

Email de bienvenida: edge function `notify-client-onboarding-welcome` (un único email a las cuentas asociadas en TO, con CC a supervisores y chiefs de los deptos implicados; tarjetas clickables `mailto:` por técnico). Necesita `verify_jwt = false` en `supabase/config.toml` para que el server action pueda invocarla con service role.

## Equipo responsable (gestión post-onboarding)

El equipo responsable es una **entidad explícita**: la tabla `public.company_team_members (company_id, profile_id, added_at, added_by)` es la fuente de verdad de quién está en el equipo de un cliente. Hasta el rediseño se derivaba de quién tenía rol Técnico, lo que impedía representar a un miembro sin asignaciones y mezclaba tres conceptos. Helper `getCompanyResponsibleTeam` en `lib/team-queries.ts` (lee de `company_team_members`, agrupa por dpto, anota técnico/chief), cacheado por `companyId`.

**Invariantes del modelo:**

- **Técnico ⟹ equipo.** No se puede ser técnico de un servicio de un cliente sin estar en su equipo. Asignar un técnico que no estaba (`assignTechnicianAdmin`, `assignAllTechniciansAdmin`) lo inserta automáticamente en `company_team_members` (helper `addCompanyTeamMembers` en `lib/team-queries.ts`).
- **Supervisor ⇏ equipo.** Se puede ser supervisor de un apartado sin estar en el equipo; asignar supervisor (`addSupervisor`, asignación múltiple) no toca `company_team_members`.
- **Granularidad intacta.** Técnico (por servicio) y supervisor (por apartado) siguen siendo asignaciones finas editables una a una en los tabs "Servicios contratados" y "Documentación". El equipo no las elimina; las contiene.

Operaciones en la ficha del cliente (`/admin/clientes/[id]` tab "Equipo responsable"):

- **Añadir empleado al equipo** (`addTeamMemberToCompany`): inserta en `company_team_members` y **siembra** filas `profile_roles` — técnico de cada servicio contratado de su(s) dpto(s) + supervisor de cada apartado del cliente vinculado a su(s) dpto(s) y de los globales. Tras sembrar, todo es editable de forma fina.
- **Quitar empleado del equipo** (`removeTeamMemberFromCompany`): borra la fila de `company_team_members` y **todas** sus filas `profile_roles` de este cliente (técnico de cualquier servicio + supervisor de cualquier apartado), sin acotar por dpto.

Hooks automáticos de siembra:
- Al contratar un servicio nuevo (`addServiceToCompany` → `autoAssignTechniciansForNewService`): los miembros del equipo que pertenecen a alguno de los dpts del servicio se autoasignan como técnicos del nuevo `company_service`. No se mete a nadie nuevo en el equipo.
- Al añadir un apartado de doc. a un cliente (`addApartadoToClient` → `getTeamSupervisorsForApartado`): los miembros del equipo de los dpts del apartado se autoasignan como supervisores; si el apartado es global, todo el equipo.
- En la pantalla de asignación múltiple (`/admin/documentacion/asignacion-multiple`): el paso 3 (supervisores) viene **pre-seleccionado** con los miembros del equipo de las empresas elegidas que son elegibles para cada apartado, y el usuario puede editarlo. La sugerencia se deriva en cliente desde `BulkAssignmentData.teamMembers`; al tocar un apartado, su selección pasa a ser manual.

Permiso: `write_dept_service` con scope `department` — el actor solo puede añadir/quitar empleados de los dpts que gestiona. `addTeamMemberToCompany` siembra sobre el subset de dpts autorizados; `removeTeamMemberFromCompany` exige permiso en ≥1 dpto del empleado y entonces desvincula por completo.

Backfill: la migración `20260515130000_company_team_members.sql` pobló la tabla con los técnicos existentes (Opción A — los supervisores puros no entraron).

## Documentación por cliente (schema `documentation`)

Catálogo de **bloques** y **apartados** validables que se asignan a cada cliente. Cada apartado tiene un estado (`pendiente | enviado | validado | rechazado`), N supervisores (cualquier miembro/chief de los departamentos del apartado, incluso de varios deptos a la vez), archivos del cliente, comentarios bidireccionales y un historial de transiciones. Los apartados del catálogo pueden tener **plantillas** descargables como ayuda al cliente.

### Matriz de documentación inicial — opcionalidad y tags

El catálogo soporta dos ejes adicionales que se usan tanto al asignar manualmente como en el wizard de onboarding:

- **Opcionalidad per-departamento** (`documentation.apartado_departments.is_optional`): un mismo apartado puede ser obligatorio para un dpto y opcional para otro. Resolución multi-dpto: un apartado es opcional en un onboarding si **todos** los deptos seleccionados que lo cubren lo marcan como opcional (basta uno mandatory para que sea obligatorio).
- **Opcionalidad para apartados globales** (`documentation.apartados.is_optional_global`): solo aplica si `is_global = true` (un CHECK lo impone a nivel BD). Marca el apartado como "opcional por defecto" en sugerencias y pre-marca el toggle al asignarlo. "Propuesta comercial" y "Tratamiento de datos" están seed-marcados como opcionales.
- **Tags** (`documentation.tags` + `documentation.apartado_tags`): condiciones extra que activan documentación. Un apartado con tags solo se incluye en el onboarding si **todos** sus tags tienen su checkbox marcado en el wizard. Tags semilla:
  - `cliente_no_viene_de_holded` — apartados que solo se piden cuando el cliente no está integrado con Holded (rosa en la matriz Excel original).
  - `solicita_alta_empresa` — apartados específicos del alta empresa (p.ej. "Cuestionario si es alta de empresa"). El catálogo bloquea este tag si el apartado no incluye Asesoría Laboral.

- Schema y RLS: `supabase/migrations/20260428100000_documentation_schema.sql` + `..._permissions.sql` + `..._storage.sql`. Migraciones posteriores: `20260428100300_rename_supervisor_id.sql`, `20260428110000_documentation_supervisors_nm.sql` (introdujo la tabla N:M `client_apartado_supervisors`, **droppeada en `20260430120100`**), `20260428110100_documentation_apartado_templates.sql`, `20260430120000_documentation_add_client_apartado_scope.sql` y `20260430120100_documentation_permissions_refactor.sql` (nuevo modelo de permisos).
- Bucket `client-documentation` (privado): paths `{company_id}/{client_apartado_id}/{file_id}/{filename}` para archivos del cliente y `templates/{apartado_id}/{template_id}/{filename}` para plantillas del catálogo. Helpers en `lib/storage/documentation.ts`.
- Permisos (tras refactor `20260430120100`):
  - `manage_documentation_catalog` — global (`scope='none'`, grantable). **NO va en Chief**: es transversal y se delega.
  - `request_client_documentation` — global (`scope='none'`, grantable). En el rol Chief.
  - `validate_documentation` — global (`scope='none'`, no grantable). En el rol Chief; permite validar/rechazar cualquier apartado.
  - `validate_client_documentation` — scope `client_apartado` (no grantable). Se obtiene **exclusivamente** vía el rol "Supervisor de apartado".
- Modelo de "supervisor": ya no existe la tabla `client_apartado_supervisors`. Asignar/quitar supervisor = INSERT/DELETE en `profile_roles` con el rol "Supervisor de apartado" y `scope_type='client_apartado'`, `scope_id=client_apartado.id`. RLS en `profile_roles` autoriza esto a quien tenga `request_client_documentation`.
- View `documentation.apartado_supervisors_v` — lista los supervisores de cada apartado a partir de `profile_roles`. Útil para los loaders (admin y cliente).
- Server actions: catálogo en `app/admin/(sidebar)/documentacion/actions.ts`; instancias por cliente en `app/admin/clientes/[id]/documentation-actions.ts`; lado cliente en `app/app/empresa/documentation-actions.ts`. La validación (`authorizeValidation`) chequea `validate_documentation` global o `validate_client_documentation` con scope `client_apartado` = id del apartado.
- UI compartida: `components/documentation/{documentation-master-detail,apartado-detail,apartado-files,apartado-comments,status-badge,apartado-templates-list}.tsx`. Modo dual (`'admin' | 'client'`).
- Tipos: `lib/types/documentation.ts`. **Importante**: los supervisores están en `apartado.supervisors` (array), no como `supervisor_id` escalar.
- IMPORTANTE para deploy: el schema `documentation` debe estar añadido a "Exposed schemas" en Supabase Dashboard → API Settings (una vez por proyecto). Sin esto el SDK devuelve 404 al hacer `.schema('documentation')`.

### Apartados kind='form' (sin archivos)

Casos del catálogo en los que el cliente aporta **datos estructurados** en lugar de archivos. Hoy: "Alta en el portal de ENISA" (usuario + contraseña) y "Listado de competidores" (lista repetible {comercial, fiscal, CIF}).

- Schema: `documentation.apartados.kind ∈ ('file','form')` + `apartados.slug` (único cuando kind='form'). El payload del cliente vive en `documentation.client_apartados.form_response` JSONB.
- Validadores compartidos cliente/admin en `lib/documentation/form-payloads.ts` (no es "use server", lo importan ambas server actions).
- UI: componente React por slug en `components/documentation/forms/<slug>.tsx`. Dispatcher en `forms/index.tsx`. Patrón uniforme: prop `canEdit` controla edición; admin con `validate_documentation` o supervisor del apartado puede rellenar el form en nombre del cliente.
- Server actions: `submitFormApartado` (cliente) y `adminSubmitFormApartado` (admin con `authorizeValidation`). **Ambos transicionan** `pendiente`/`rechazado` → `enviado` (a diferencia de `adminUploadApartadoFile` que no transiciona — un form se rellena entero, no por partes).
- ENISA — cifrado AES-256-GCM en `lib/crypto/enisa.ts`. Key en env `ENISA_ENCRYPTION_KEY` (32 bytes base64, generada con `openssl rand -base64 32`). **Una key distinta por entorno**, ambas con backup en 1Password (LeanFinance/Intranet). Sin la key, las contraseñas almacenadas son irrecuperables. Descifrado on-demand vía server action `getDecryptedEnisaPassword` gateado por `authorizeValidation` (Chief o Supervisor del apartado).
- Si surge un 3er apartado kind='form': añadir slug a `FormApartadoSlug`, shape a `FormResponseBySlug`, validador a `form-payloads.ts`, componente bajo `forms/<slug>.tsx`, y extender el switch de los 2 server actions. NO construir form-builder genérico.

---

## Dashboard fiscal (servicio `dashboard`, schema `dashboard`)

Servicio del dpto Asesoría Fiscal y Contable (slug `dashboard`). Si una empresa lo tiene contratado, en `/app/dashboard` ve un dashboard agregado a partir de su Google Sheet (que mantiene el equipo). NO se asignan técnicos a este servicio. En el sidebar del cliente el item "Dashboard" se muestra solo si la empresa activa tiene el servicio contratado.

Vista admin: existe `/admin/clientes/[id]/dashboard` (réplica de la vista del cliente) accesible para quien tenga `read_dept_service` en el dpto fiscal — Miembro, Chief, Observador y Operador. La gate vive en `lib/dashboard-admin-access.ts` (`canViewClientDashboard`). En el sidebar read-only de la ficha del cliente y en el panel "Servicios contratados" el chip "Dashboard" muestra un link a esa vista cuando aplica.

- Schema `dashboard.client_dashboards` (`company_id` PK, `sheet_id`, `sheet_name` nullable, `sheet_gid`, audit fields). RLS: cliente lee solo si pertenece a la empresa Y tiene servicio `dashboard` activo. Admin lee/escribe (gate fino en server actions con `requirePermission('write_dept_service', dept fiscal)`).
- Lectura del Sheet: NO leemos la pestaña visual de KPIs (depende del filtro temporal del equipo). Leemos las **3 hojas crudas** (`facturasVentaHolded_lineas`, `Facturas_compra_holded`, `extractosBancarios`, matcheadas con regex case-insensitive sobre los títulos) y agregamos en server según el filtro del cliente. Cero impacto en el Sheet del equipo, sin race conditions.
- Auth: OAuth 2.0 Web Application + refresh token de larga duración asociado a una cuenta de Google del equipo (p.ej. `tech@leanfinance.es`) que ya tiene acceso a los Sheets de los clientes. **NO** es service account — así no hay que compartir cada Sheet con un email extra. Setup one-time en `/admin/dashboard-oauth-setup`.
- Env vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`. Opcional: `DASHBOARD_AUTHORIZED_EMAIL` (solo se usa como hint en panel admin).
- Filtros UI cliente vía search params: `?period=q1|q2|q3|q4` (default año actual completo) y `?bank=<cuenta>` (default todas las cuentas). El filtro temporal cubre KPIs, gráficos mensuales y tabla de pendientes; el filtro de banco solo aplica a la columna Bancos.
- Render: 3 columnas (Ventas / Compras / Bancos) con switcher Totales↔Gráfico (Recharts area chart) en Ventas y Compras (default = Gráfico cuando hay datos mensuales). Tabla de pendientes/vencidos por cliente/proveedor con despliegue por click a las facturas individuales.
- Cifras: ventas suma `Subtotal Línea` (sin IVA, igual que el GS), bancos `pendiente de conciliar` en valor absoluto, filas sin cliente/proveedor agrupadas como `(Sin cliente)` / `(Sin proveedor)` (no se descartan, suman al total).
- Cache: `unstable_cache` 24h con tag `dashboard:<companyId>` (el GS se actualiza 1x/día). Bumpea el cache key del fetch (`dashboard-raw-vN`) si cambias el shape de `RawDashboardData`.
- Panel admin: en `/admin/clientes/[id]` tab "Servicios contratados", al añadir el servicio Dashboard aparece un panel para pegar la URL del Sheet (sin requerir nombre de pestaña — las hojas se localizan por regex). Al quitar el servicio se borra la fila de `dashboard.client_dashboards`.
- Server actions admin: `getCompanyDashboardConfig`, `setDashboardSheet`, `clearDashboardSheet` en `app/admin/clientes/actions.ts`. Permiso requerido: `write_dept_service` con scope = dept Asesoría Fiscal y Contable.
- IMPORTANTE para deploy: el schema `dashboard` debe estar añadido a "Exposed schemas" en Supabase Dashboard → API Settings (una vez por proyecto). Sin esto el SDK devuelve 404 al hacer `.schema('dashboard')`. Los redirect URIs del OAuth Client deben incluir `http://localhost:3000/api/dashboard-oauth-callback` (dev) y `https://admin.leanfinance.es/api/dashboard-oauth-callback` (prod).
- Detalle operativo y troubleshooting: `docs/dashboard-setup.md`.

---

## Declaración de la renta (servicio `declaracion-renta`, schema `renta`)

Servicio del dpto Asesoría Fiscal y Contable (slug `declaracion-renta`, `LOAD_BEARING`). Formulario público para que cada persona que va a presentar su declaración con Lean Finance rellene su perfil + deducciones autonómicas, sin necesidad de cuenta en la plataforma. PR #45 (rama `feature/declaracion-renta-form`).

### Flujo

1. Admin contrata el servicio para la empresa.
2. Admin abre `/admin/clientes/[id]/renta` (página dedicada con KPIs + 3 cards: DNIs autorizados, enlace público, envíos recibidos). En el tab "Informes / Formularios" de la ficha del cliente hay una tarjeta resumen con CTA a la página dedicada.
3. Admin da de alta los DNIs que pueden rellenar el formulario (`renta.authorized_filers`, UNIQUE por `(company_id, dni)`).
4. Admin pulsa "Generar enlace" → token 32 bytes URL-safe, expira a 90 días (`renta.invitations`, UNIQUE parcial: un único activo por empresa).
5. Admin pulsa "Enviar por email" → edge function `notify-renta-invitation` manda email a las cuentas asociadas (Resend, paleta teal+navy) con dos CTAs: enlace público + acceso al portal cliente. También dispara notificación in-app a esos clientes (`public.notifications`).
6. Familiares/empleados entran en `/renta/<token>` (ruta pública, fuera de admin/app). Introducen DNI → server action `verifyDni` valida contra `authorized_filers` + chequea no-duplicado en `submissions`. Si OK, prefilla nombre bloqueado.
7. Wizard de 7 pasos: DNI → Ubicación+vivienda → Personales → Familiar → Ingresos → Deducciones (una pantalla por candidato con tres opciones: "Sí, me aplica" / "No estoy seguro" / "No me aplica") → Revisión y envío. Las marcadas "No estoy seguro" se guardan en `submissions.uncertain_deductions` (text[]) sin extra_fields — el asesor las valora manualmente. `submitRenta` re-evalúa server-side el rule engine y filtra deducciones inelegibles inyectadas (tanto las "Sí" como las dudosas).
8. Submission llega → notificación in-app **y email** a técnicos asignados al servicio (vía `fetchTechniciansForService`, fallback chiefs del dpto). El email lo manda la edge function `notify-renta-submission`. Admin la ve en la página dedicada con título legible + checklist de requisitos + extras formateados (€, Sí/No, locale ES) + bloque ámbar de "Deducciones con dudas".
9. Admin revisa el envío y **edita las deducciones confirmadas** (`submissions.confirmed_deductions`) en `ConfirmedDeductionsEditor`: lista de confirmadas (cada una con botón "Quitar"), lista "El contribuyente no lo tenía claro" para las marcadas "No estoy seguro" (botones "Sí, le corresponde" / "No le corresponde"), y un buscador del catálogo de la CCAA para añadir cualquier otra. Cada acción se autoguarda (no hay botón Guardar). Arranca con las marcadas "Sí" como propuesta. Al marcar el envío como `revisada` el editor queda **bloqueado en solo lectura**; para volver a editarlo hay que marcarlo de nuevo como `pendiente`.
10. Admin puede marcar `revisada` / `pendiente`, añadir notas internas, o **revocar la submission** (soft-delete con `revoked_at`) para que el familiar pueda volver a rellenar con el mismo enlace y DNI.
11. Cuando la submission pasa a `revisada`, el cliente ve en su portal (`/app/informes/renta`) las deducciones confirmadas a las que esa persona tiene derecho.

### Schema `renta`

- `invitations` — token por empresa. `status ∈ ('activa','revocada','expirada')`, `expires_at`. UNIQUE parcial sobre `(company_id)` cuando `status='activa'`.
- `authorized_filers` — lista blanca de DNIs por empresa. `dni` normalizado (upper, sin espacios) por CHECK. UNIQUE `(company_id, dni)`.
- `submissions` — una fila por DNI que rellena el form. `UNIQUE (invitation_id, authorized_filer_id) WHERE revoked_at IS NULL` (parcial → permite re-submit tras revoke). FK ON DELETE RESTRICT sobre `authorized_filer_id` (no se puede borrar un autorizado con submissions, ni siquiera revocadas — preserva histórico). Tres campos de deducciones: `deductions_response` jsonb (las marcadas "Sí" por el contribuyente con sus extra_fields), `uncertain_deductions` text[] (ids de las "No estoy seguro"), `confirmed_deductions` text[] (lista definitiva editada por el asesor — visible al cliente cuando `status='revisada'`; arranca igual a las claves de `deductions_response`).
- `deductions` — catálogo data-driven de las 349 deducciones autonómicas (15 CCAA, sin Navarra ni País Vasco por régimen foral). Campos clave: `what_covers` (descripción), `requirements` (jsonb array de bullets legibles), `eligibility_rule` (AST JSON evaluado por `lib/renta/rule-engine.ts`), `extra_fields` (form inputs a rellenar si aplica). SELECT abierto a `anon` (lo necesita el form público); INSERT/UPDATE solo admin.
- `rate_limit` — eventos de rate-limit por IP/token/acción para el endpoint público. Sin policies (solo service role).

RLS: todas las tablas admin-only excepto `deductions` (SELECT anon). El form público accede vía server actions con `service_role` y filtrado manual por `company_id` derivada del token.

### Ruta pública `/renta/[token]`

- Bypass en `middleware.ts` (`pathname.startsWith("/renta/")`) antes del rewrite por host. Si llega por `admin.leanfinance.es` → redirige a `app.leanfinance.es`.
- Layout propio en `app/renta/[token]/layout.tsx` (header blanco + logo + footer), separado del shell admin/app. Usa `h-screen overflow-y-auto` para contrarrestar el `html { overflow: hidden }` global del proyecto.
- El `page.tsx` resuelve los emails de los técnicos del servicio (fallback chiefs) y los pasa a `RentaForm`, que pinta un enlace persistente "Contacta con tu asesor" al pie de cada paso (`mailto:` a esos técnicos, mismo patrón que Modelos fiscales).
- Server actions en `app/renta/[token]/actions.ts`:
  - `verifyDni(token, dni)`: rate-limit 5/min/IP, 20/min/token. Devuelve `not_authorized` si el DNI no está en authorized_filers, `already_submitted` si ya hay submission no revocada, `invalid_dni` si la letra no valida.
  - `submitRenta(input)`: rate-limit 3/min/IP, 10/min/token. Re-evalúa `eligibility_rule` server-side y filtra `deductions_response` (anti-inyección).
- DNI: normalización + validación de letra en `lib/renta/dni.ts`.

### Catálogo de deducciones — operativa

- Source of truth: 15 archivos JSON en `supabase/seeds/renta/deductions/ES-XX.json`. Cada deducción tiene `id` slug, `ccaa_code` (ISO `ES-AN`, etc.), `title`, `what_covers`, `requirements: string[]`, `legal_reference`, `eligibility_rule`, `extra_fields`, `display_order`, `is_active`.
- Para regenerar la migración seed: `node scripts/build-renta-seed.mjs`. El script concatena los JSONs y reescribe el archivo de migración **más reciente** (constante `MIGRATION_PATH`).
- **IMPORTANTE**: si editas los JSONs y necesitas re-aplicar el catálogo en una BD donde el seed actual YA está aplicado, hay que crear una migración nueva con timestamp posterior (Supabase no re-ejecuta migraciones por contenido, solo por timestamp). Actualiza `MIGRATION_PATH` en el script al nuevo nombre. Patrón ya en uso: `20260514110100_renta_seed_deductions.sql` (histórico, vieja columna `summary`) → `20260514140000_renta_reseed_deductions.sql` (actual, columnas `what_covers` + `requirements`).
- Para 349 deducciones × 15 CCAA, la extracción del manual oficial (`Manual_práctico_de_Renta_2025._Parte_2._Deducciones_autonómicas.pdf`) se hizo AI-assisted con un agente por CCAA. La revisión normativa fina (Esther) está pendiente — el catálogo no se ha expuesto en prod todavía.

### Motor de reglas (`lib/renta/rule-engine.ts`)

JSON AST con operadores `all_of` / `any_of` / `not` + hojas `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `between`, `truthy`, `age_gte`, `age_lt`, `any_kid_age_lt`, `any_kid_age_between`. Paths con dot notation sobre `RentaProfileResponse` (`housing.type`, `kids.length`, `disability_pct`, etc.). Edad calculada a 31/12 del año fiscal (env `RENTA_FISCAL_YEAR`).

### Portal cliente

- `/app/informes` — índice de informes disponibles. Hoy solo "Declaración de la renta" si la empresa activa lo tiene contratado.
- `/app/informes/renta` — el cliente ve: enlace público con botón Copiar + caducidad, lista read-only de DNIs autorizados, lista de envíos recibidos como tarjetas plegables. Al desplegar un envío `revisada` ve las deducciones confirmadas por el asesor (cada una en un desplegable `DeductionCollapsible` con qué cubre + requisitos). **NO** se expone `profile_response`, `deductions_response`, `uncertain_deductions`, `admin_notes`, ni el token raw — solo `confirmed_deductions` (resueltas a título + descripción) y solo para envíos revisados.
- Sidebar cliente: item "Informes / Formularios" con icono clipboard-with-check, gateado por `hasDeclaracionRenta`. Dashboard fiscal mantiene su sección propia.
- Server actions con `assertClientCanSeeRenta` (requireClient + verifica que el user pertenece a la empresa activa Y la empresa tiene el servicio). `notFound()` si no.

### Buscador global

Entry dinámica por empresa con servicio activo (`company-renta:{id}` en `lib/search/build-destinations.ts`) → `/clientes/{id}/renta` (admin) o `/informes/renta` (cliente).

### IMPORTANTE para deploy

- Schema `renta` debe estar añadido a "Exposed schemas" en Supabase Dashboard → API Settings (una vez por proyecto). Sin esto el SDK devuelve 404 al hacer `.schema('renta')`.
- Edge functions: `supabase functions deploy notify-renta-invitation --project-ref <ref>` y `supabase functions deploy notify-renta-submission --project-ref <ref>`. Ambas registradas con `verify_jwt = false` en `config.toml`.
- Migraciones `20260515100000_renta_submissions_uncertain.sql` (columna `uncertain_deductions`) y `20260515110000_renta_submissions_confirmed.sql` (columna `confirmed_deductions`) — aplicar con `supabase db push` en dev y luego prod.
- Variable env `WEBHOOK_SECRET` debe estar en `.env.local` del Next y como secret de la edge function (mismo valor).

---

## Estructura de rutas

```
app/app/login/page.tsx              → Login clientes (GIS popup o OAuth fallback)
app/app/select-company/             → Selector de empresa (si el cliente tiene varias)
app/app/dashboard/page.tsx          → Dashboard clientes
app/admin/login/page.tsx            → Login empleados (GIS popup o OAuth fallback)
app/admin/select-department/        → Selector de departamento (si el admin tiene varios)
app/admin/dashboard/page.tsx        → Dashboard empleados
app/admin/clientes/onboarding/      → Wizard de alta de cliente (4 pasos)
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

## Buscador global (Cmd/Ctrl+K)

Paleta tipo Spotlight disponible en ambos espacios (admin y cliente). Se abre con `Cmd/Ctrl+K` o con el botón "Buscar" del sidebar. Permite navegar a páginas y, en admin, saltar directamente a la ficha de un cliente o a vistas de servicio por cliente (p.ej. "Modelos fiscales de {cliente}", "Dashboard de {cliente}").

### Arquitectura

- `lib/search/registry.ts` — **registry estático** de páginas (`PAGE_ENTRIES`). Cada entrada: `id`, `space` (`admin` | `client`), `label`, `path` (sin prefijo, lo añade `getLinkPrefix`), `icon`, `keywords[]`, y opcional `gate(ctx)` para condicionarla a permisos/servicios contratados.
- `lib/search/` — builder de destinos dinámicos (empresas, vistas por cliente), matching con normalización de acentos, tokens AND y bonus por match al inicio.
- `lib/actions/search.ts` — `getSearchableCompanies()` cacheada 5min con tag `search:companies`. Si cambias datos relevantes de empresas, `revalidateTag("search:companies")`.
- `components/search/{search-provider,search-palette,search-trigger,icons}.tsx` — provider con context + listener global de teclado. Integrada en `app/admin/(sidebar)/layout.tsx` y `app/app/(sidebar)/layout.tsx`; los layouts pasan al ctx `role`, `hasTaxModels`, `hasDashboard`, `companies`, `activeCompanyId` ya resueltos.

### ⚠️ MANTENIMIENTO — al crear nueva sección, página o vista por cliente

Cada vez que se añada una nueva ruta navegable o una nueva vista por cliente, hay que registrarla en el buscador. Es fácil olvidarlo y deja la UX coja.

Checklist al introducir algo nuevo:

1. **Página estática (admin o cliente)** → añadir una entrada en `PAGE_ENTRIES` de `lib/search/registry.ts` con `space`, `label`, `path`, `icon`, `keywords` (sinónimos en castellano e inglés que pueda teclear el usuario) y `gate` si depende de un permiso/servicio.
2. **Vista por cliente accesible desde admin** (estilo `/admin/clientes/[id]/<algo>` o `/admin/<servicio>?company=...`) → además de la entrada estática, extender el builder de destinos dinámicos en `lib/search/` para que aparezca un resultado "{Servicio} de {cliente}" por cada empresa que tenga ese servicio activo. Usar el mismo patrón que `Modelos fiscales de {cliente}` / `Dashboard de {cliente}`.
3. **Nuevo servicio contratable** que añada un item al sidebar del cliente (como `dashboard` o `tax-models`) → ampliar el ctx del provider (`hasDashboard`/`hasTaxModels`/…) y añadir el `gate` correspondiente a la entrada cliente.
4. **Cambia el icono disponible** → registrar el nuevo símbolo en `components/search/icons.tsx`.
5. **Probar Cmd/Ctrl+K** en ambos espacios tecleando uno de los `keywords` para verificar que aparece y que el destino navega bien (recordar que las rutas se prefijan vía `getLinkPrefix`, **no** hardcodear `/admin/` ni `/app/`).

Acciones rápidas (botones "+ Nuevo …") y apartados de documentación **están deliberadamente fuera del buscador** — no añadirlos sin discutirlo. Solo van páginas + destinos por cliente.

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
ENISA_ENCRYPTION_KEY              # 32 bytes base64 — cifra contraseñas ENISA (distinta por entorno, backup en 1Password)
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
