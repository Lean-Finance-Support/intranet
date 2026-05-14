# Supabase — pipeline de migraciones y edge functions

Fuente de verdad de la base de datos y las edge functions de LeanFinance Intranet.

## Proyectos

| Entorno | Ref                    | Región             |
|---------|------------------------|--------------------|
| prod    | `wgxugccbatusioubnsfl`  | eu-west-1 (Irlanda)|
| dev     | `rvnflidcbiinmlfpzsbf`  | eu-north-1 (Estocolmo)|

Plan Free → sin Supabase Branches; aislamos por proyectos separados.

## Estructura

```
supabase/
├── config.toml              # Config de Supabase CLI (shared)
├── migrations/              # SQL versionado — única fuente de verdad del schema
│   └── YYYYMMDDhhmmss_<slug>.sql
├── functions/               # Edge functions Deno
└── dumps/                   # Dumps ad-hoc (gitignored si contienen datos)
```

## Configuración inicial por entorno

Ejecutar UNA vez por proyecto tras aplicar migraciones:

```sql
INSERT INTO public.app_settings (key, value) VALUES
  ('supabase_url',   'https://<ref>.supabase.co'),
  ('webhook_secret', '<secret>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

Los triggers `trigger_notify_*` leen de esta tabla (via `public.app_setting(key)`) para disparar webhooks a las edge functions del entorno correcto. El `webhook_secret` debe coincidir con el secret `WEBHOOK_SECRET` configurado en las edge functions del mismo proyecto.

Nota: en Supabase Free no podemos usar `ALTER DATABASE ... SET` (bloqueado a superuser), por eso usamos una tabla. RLS está activado y anon/authenticated no pueden leerla.

## Añadir una migración nueva

1. `supabase migration new <slug>` (o crear manualmente `supabase/migrations/YYYYMMDDhhmmss_<slug>.sql`).
2. Escribir SQL idempotente si es posible.
3. Aplicar a **dev** primero: `supabase db push` (con proyecto linkado a dev).
4. Probar el cambio.
5. PR + merge.
6. Aplicar a **prod**: `supabase db push` (proyecto linkado a prod).

Las migraciones son la única vía para cambiar el schema — no tocar tablas/triggers/functions directamente desde el dashboard.

### ⚠️ GRANTs explícitos al crear tablas en `public` (a partir del 30-oct-2026)

Supabase deja de exponer por defecto las tablas nuevas del schema `public` a la Data API (supabase-js / PostgREST / GraphQL). Las tablas ya existentes mantienen sus GRANTs actuales — solo afecta a tablas creadas **a partir del 30 octubre 2026** en nuestros proyectos.

Patrón obligatorio para cualquier `create table public.<x>` desde esa fecha:

```sql
create table public.<tabla> ( ... );

grant select, insert, update, delete on public.<tabla> to authenticated;
grant select, insert, update, delete on public.<tabla> to service_role;
-- grant select on public.<tabla> to anon;  -- solo si lo necesita un endpoint público

alter table public.<tabla> enable row level security;
-- + políticas RLS habituales
```

Sin el GRANT, el SDK devuelve error `42501` indicando exactamente qué statement falta. Las tablas en schemas propios (`documentation`, `dashboard`, `renta`, ...) ya requieren GRANT explícito + estar añadidos en "Exposed schemas" → no cambia nada para ellos.

## Añadir o actualizar una edge function

1. Código Deno en `supabase/functions/<slug>/index.ts`.
2. Secrets locales en `supabase/.env.local` (gitignored) para test; en cada entorno via `supabase secrets set --project-ref <ref> KEY=VALUE`.
3. Deploy: `supabase functions deploy <slug> --project-ref <ref>`.

Secrets actuales usados:
- `RESEND_API_KEY` — clave de Resend (una por entorno; prod y dev apuntan a dominios distintos)
- `WEBHOOK_SECRET` — debe coincidir con `app.settings.webhook_secret` del DB del mismo entorno
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — inyectados automáticamente por Supabase

## Linkar proyecto con el CLI

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...            # personal access token
supabase link --project-ref <ref> --password <db_password>
```

El `.supabase/` local (gitignored) guarda qué proyecto está linkado.
