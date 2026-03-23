# Arquitectura del Proyecto — Intranet LeanFinance

## Visión general

Plataforma con dos espacios diferenciados:
- **Portal de clientes** → `app.leanfinance.es` — empresas clientes y sus empleados
- **Portal de empleados** → `admin.leanfinance.es` — equipo interno de LeanFinance

Una única aplicación Next.js sirve ambos dominios. El middleware detecta el host y enruta internamente a `/app/*` o `/admin/*` según corresponda.

---

## Stack tecnológico

| Rol | Tecnología |
|-----|-----------|
| Framework | Next.js 15.x (App Router) |
| Lenguaje | TypeScript 5.x |
| Estilos | Tailwind CSS 4.x |
| Autenticación | Supabase Auth — Google OAuth exclusivamente |
| Base de datos | Supabase (PostgreSQL) |
| Despliegue | Vercel |
| CI/CD | Vercel Git Integration (auto-deploy en push a main) |

---

## Estructura de rutas

```
app/
├── app/                    # Rutas del portal de clientes (app.leanfinance.es)
│   ├── login/page.tsx
│   └── dashboard/page.tsx
├── admin/                  # Rutas del portal de empleados (admin.leanfinance.es)
│   ├── login/page.tsx
│   └── dashboard/page.tsx
├── auth/
│   ├── callback/route.ts   # Handler OAuth fallback — intercambia código, comprueba perfil, redirige
│   └── verify/route.ts     # Handler GIS — verifica sesión existente, comprueba perfil, redirige
├── unauthorized/
│   └── page.tsx            # Pantalla "sin acceso" para usuarios sin perfil
└── layout.tsx / globals.css
```

### Routing por dominio (middleware.ts)

En **producción** el middleware detecta el host:
- `app.leanfinance.es/*`   → rewrite interno a `/app/*`
- `admin.leanfinance.es/*` → rewrite interno a `/admin/*`

En **local** las rutas se acceden directamente:
- `localhost:3000/app/login`
- `localhost:3000/admin/login`

---

## Flujo de autenticación (Google OAuth)

### Flujo preferido — GIS popup (requiere `NEXT_PUBLIC_GOOGLE_CLIENT_ID`)
1. Usuario pulsa el botón de Google → se abre un popup de Google Identity Services
2. Google autentica y devuelve un ID token directamente al cliente
3. El cliente llama a `supabase.auth.signInWithIdToken(token)` — sin redirigir a Supabase
4. Se navega a `/auth/verify`, que verifica el perfil y redirige según el rol

### Flujo fallback — OAuth redirect (cuando no hay `NEXT_PUBLIC_GOOGLE_CLIENT_ID`)
1. Usuario pulsa "Continuar con Google" → `signInWithOAuth` redirige a Google
2. Google devuelve a `supabase.co/auth/v1/callback` (URL brevemente visible)
3. Supabase redirige a `/auth/callback?code=...`
4. El callback intercambia el código por sesión y verifica el perfil

### Lógica de verificación (común a ambos flujos)
- Sin perfil → `signOut()` + redirect a `/unauthorized`
- `role: admin` → redirect a `admin.leanfinance.es/dashboard`
- `role: client` → redirect a `app.leanfinance.es/dashboard`

El middleware protege todas las rutas: comprueba sesión y rol en cada request.

**No hay auto-registro.** Los usuarios son creados manualmente por los administradores.
El trigger solo crea perfil si el admin especifica `role` en los metadatos del usuario.

---

## Modelo de datos (Supabase — schema public)

### `public.profiles`
Vinculada 1:1 con `auth.users`. Se crea automáticamente vía trigger al crear un usuario.

| Columna | Tipo | Notas |
|---------|------|-------|
| id | uuid PK | FK → auth.users.id |
| email | text | |
| full_name | text | nullable |
| role | enum(client, admin) | obligatorio |
| department | text | nullable — solo para admins |
| company_id | uuid | nullable — FK → companies.id, para clientes |
| created_at | timestamptz | |
| updated_at | timestamptz | auto-actualizado por trigger |

### `public.companies`
Empresa cliente. Una empresa puede tener N usuarios (profiles) vinculados.

| Columna | Tipo | Notas |
|---------|------|-------|
| id | uuid PK | gen_random_uuid() |
| legal_name | text NOT NULL | Razón social / nombre legal (solo editable desde BD) |
| company_name | text | Nombre comercial (opcional, editable por admins) |
| nif | text | |
| phone | text | |
| address | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## Roles

| Rol | Dominio | Descripción |
|-----|---------|-------------|
| `admin` | admin.leanfinance.es | Empleado de LeanFinance |
| `client` | app.leanfinance.es | Usuario de empresa cliente |

El middleware redirige automáticamente si un usuario intenta acceder al dominio incorrecto.

---

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=https://app.leanfinance.es
NEXT_PUBLIC_ADMIN_URL=https://admin.leanfinance.es
NEXT_PUBLIC_GOOGLE_CLIENT_ID=   # Activa flujo GIS (sin URL de Supabase visible)
```

---

## Configuración externa

- **Supabase Auth**: proveedor Google activado con Client ID y Secret de Google Cloud
- **Supabase URL Configuration**: `https://app.leanfinance.es/auth/callback` y `https://admin.leanfinance.es/auth/callback` como redirect URLs permitidas
- **Google Cloud Console**: URI de redireccionamiento → `https://wgxugccbatusioubnsfl.supabase.co/auth/v1/callback`
- **Vercel**: ambos dominios apuntando al mismo proyecto `intranet`
- **Dinahosting DNS**: CNAME para `app` y `admin` apuntando a Vercel
