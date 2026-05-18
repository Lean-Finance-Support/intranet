# Declaración de la renta (servicio `declaracion-renta`, schema `renta`)

Servicio del dpto Asesoría Fiscal y Contable (slug `declaracion-renta`, `LOAD_BEARING`). Formulario público para que cada persona que va a presentar su declaración con Lean Finance rellene su perfil + deducciones autonómicas, sin necesidad de cuenta en la plataforma. PR #45 (rama `feature/declaracion-renta-form`).

## Flujo

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

## Schema `renta`

- `invitations` — token por empresa. `status ∈ ('activa','revocada','expirada')`, `expires_at`. UNIQUE parcial sobre `(company_id)` cuando `status='activa'`.
- `authorized_filers` — lista blanca de DNIs por empresa. `dni` normalizado (upper, sin espacios) por CHECK. UNIQUE `(company_id, dni)`.
- `submissions` — una fila por DNI que rellena el form. `UNIQUE (invitation_id, authorized_filer_id) WHERE revoked_at IS NULL` (parcial → permite re-submit tras revoke). FK ON DELETE RESTRICT sobre `authorized_filer_id` (no se puede borrar un autorizado con submissions, ni siquiera revocadas — preserva histórico). Tres campos de deducciones: `deductions_response` jsonb (las marcadas "Sí" por el contribuyente con sus extra_fields), `uncertain_deductions` text[] (ids de las "No estoy seguro"), `confirmed_deductions` text[] (lista definitiva editada por el asesor — visible al cliente cuando `status='revisada'`; arranca igual a las claves de `deductions_response`).
- `deductions` — catálogo data-driven de las 349 deducciones autonómicas (15 CCAA, sin Navarra ni País Vasco por régimen foral). Campos clave: `what_covers` (descripción), `requirements` (jsonb array de bullets legibles), `eligibility_rule` (AST JSON evaluado por `lib/renta/rule-engine.ts`), `extra_fields` (form inputs a rellenar si aplica). SELECT abierto a `anon` (lo necesita el form público); INSERT/UPDATE solo admin.
- `rate_limit` — eventos de rate-limit por IP/token/acción para el endpoint público. Sin policies (solo service role).

RLS: todas las tablas admin-only excepto `deductions` (SELECT anon). El form público accede vía server actions con `service_role` y filtrado manual por `company_id` derivada del token.

## Ruta pública `/renta/[token]`

- Bypass en `middleware.ts` (`pathname.startsWith("/renta/")`) antes del rewrite por host. Si llega por `admin.leanfinance.es` → redirige a `app.leanfinance.es`.
- Layout propio en `app/renta/[token]/layout.tsx` (header blanco + logo + footer), separado del shell admin/app. Usa `h-screen overflow-y-auto` para contrarrestar el `html { overflow: hidden }` global del proyecto.
- El `page.tsx` resuelve los emails de los técnicos del servicio (fallback chiefs) y los pasa a `RentaForm`, que pinta un enlace persistente "Contacta con tu asesor" al pie de cada paso (`mailto:` a esos técnicos, mismo patrón que Modelos fiscales).
- Server actions en `app/renta/[token]/actions.ts`:
  - `verifyDni(token, dni)`: rate-limit 5/min/IP, 20/min/token. Devuelve `not_authorized` si el DNI no está en authorized_filers, `already_submitted` si ya hay submission no revocada, `invalid_dni` si la letra no valida.
  - `submitRenta(input)`: rate-limit 3/min/IP, 10/min/token. Re-evalúa `eligibility_rule` server-side y filtra `deductions_response` (anti-inyección).
- DNI: normalización + validación de letra en `lib/renta/dni.ts`.

## Catálogo de deducciones — operativa

- Source of truth: 15 archivos JSON en `supabase/seeds/renta/deductions/ES-XX.json`. Cada deducción tiene `id` slug, `ccaa_code` (ISO `ES-AN`, etc.), `title`, `what_covers`, `requirements: string[]`, `legal_reference`, `eligibility_rule`, `extra_fields`, `display_order`, `is_active`.
- Para regenerar la migración seed: `node scripts/build-renta-seed.mjs`. El script concatena los JSONs y reescribe el archivo de migración **más reciente** (constante `MIGRATION_PATH`).
- **IMPORTANTE**: si editas los JSONs y necesitas re-aplicar el catálogo en una BD donde el seed actual YA está aplicado, hay que crear una migración nueva con timestamp posterior (Supabase no re-ejecuta migraciones por contenido, solo por timestamp). Actualiza `MIGRATION_PATH` en el script al nuevo nombre. Patrón ya en uso: `20260514110100_renta_seed_deductions.sql` (histórico, vieja columna `summary`) → `20260514140000_renta_reseed_deductions.sql` (actual, columnas `what_covers` + `requirements`).
- Para 349 deducciones × 15 CCAA, la extracción del manual oficial (`Manual_práctico_de_Renta_2025._Parte_2._Deducciones_autonómicas.pdf`) se hizo AI-assisted con un agente por CCAA. La revisión normativa fina (Esther) está pendiente — el catálogo no se ha expuesto en prod todavía.

## Motor de reglas (`lib/renta/rule-engine.ts`)

JSON AST con operadores `all_of` / `any_of` / `not` + hojas `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `between`, `truthy`, `age_gte`, `age_lt`, `any_kid_age_lt`, `any_kid_age_between`. Paths con dot notation sobre `RentaProfileResponse` (`housing.type`, `kids.length`, `disability_pct`, etc.). Edad calculada a 31/12 del año fiscal (env `RENTA_FISCAL_YEAR`).

## Portal cliente

- `/app/informes` — índice de informes disponibles. Hoy solo "Declaración de la renta" si la empresa activa lo tiene contratado.
- `/app/informes/renta` — el cliente ve: enlace público con botón Copiar + caducidad, lista read-only de DNIs autorizados, lista de envíos recibidos como tarjetas plegables. Al desplegar un envío `revisada` ve las deducciones confirmadas por el asesor (cada una en un desplegable `DeductionCollapsible` con qué cubre + requisitos). **NO** se expone `profile_response`, `deductions_response`, `uncertain_deductions`, `admin_notes`, ni el token raw — solo `confirmed_deductions` (resueltas a título + descripción) y solo para envíos revisados.
- Sidebar cliente: item "Informes / Formularios" con icono clipboard-with-check, gateado por `hasDeclaracionRenta`. Dashboard fiscal mantiene su sección propia.
- Server actions con `assertClientCanSeeRenta` (requireClient + verifica que el user pertenece a la empresa activa Y la empresa tiene el servicio). `notFound()` si no.

## Buscador global

Entry dinámica por empresa con servicio activo (`company-renta:{id}` en `lib/search/build-destinations.ts`) → `/clientes/{id}/renta` (admin) o `/informes/renta` (cliente).

## IMPORTANTE para deploy

- Schema `renta` debe estar añadido a "Exposed schemas" en Supabase Dashboard → API Settings (una vez por proyecto). Sin esto el SDK devuelve 404 al hacer `.schema('renta')`.
- Edge functions: `supabase functions deploy notify-renta-invitation --project-ref <ref>` y `supabase functions deploy notify-renta-submission --project-ref <ref>`. Ambas registradas con `verify_jwt = false` en `config.toml`.
- Migraciones `20260515100000_renta_submissions_uncertain.sql` (columna `uncertain_deductions`) y `20260515110000_renta_submissions_confirmed.sql` (columna `confirmed_deductions`) — aplicar con `supabase db push` en dev y luego prod.
- Variable env `WEBHOOK_SECRET` debe estar en `.env.local` del Next y como secret de la edge function (mismo valor).
