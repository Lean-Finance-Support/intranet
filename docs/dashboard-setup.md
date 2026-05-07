# Servicio Dashboard — setup

El servicio "Dashboard" muestra el dashboard fiscal de cada cliente, alimentado desde un Google Sheet del equipo de Asesoría Fiscal y Contable. La app lee el Sheet server-side con OAuth (refresh token de larga duración asociado a una cuenta de Google del equipo, p. ej. `tech@leanfinance.es`, que ya tiene acceso de lectura a todos los Sheets de clientes) y lo renderiza con la paleta de Lean Finance.

## Setup único (por proyecto Supabase)

1. Aplicar migraciones (`supabase db push --linked`).
2. **Exposed schemas**: en Supabase Dashboard → Project Settings → API → Settings, añadir `dashboard` a la lista. Sin esto, la SDK devuelve 404 al hacer `.schema('dashboard')`.

## Setup único (por proyecto Vercel)

### 1. OAuth Client en Google Cloud

En el mismo proyecto que ya usas (o uno nuevo):

1. APIs & Services → Library → habilitar **Google Sheets API** (si no está ya).
2. APIs & Services → Credentials → Create credentials → **OAuth client ID** → tipo **Web application**.
   - Nombre: `intranet-sheets-reader` (es independiente del OAuth Client del login).
   - Authorized redirect URIs:
     - `http://localhost:3000/api/dashboard-oauth-callback` (dev)
     - `https://admin.leanfinance.es/api/dashboard-oauth-callback` (prod)
3. Apunta el **Client ID** y el **Client secret**.

### 2. Variables de entorno

En `.env.local` (y luego en Vercel preview + prod):

- `GOOGLE_OAUTH_CLIENT_ID` — el client_id del OAuth client recién creado.
- `GOOGLE_OAUTH_CLIENT_SECRET` — el client_secret.
- `GOOGLE_OAUTH_REFRESH_TOKEN` — se genera en el siguiente paso.

### 3. Generar el refresh token (one-time)

1. Reinicia el dev server (o hace deploy con las dos primeras vars).
2. Ve a `/admin/dashboard-oauth-setup` logueado como admin.
3. Click en "Autorizar con Google" y entra con la cuenta que tiene acceso a los Sheets (p. ej. `tech@leanfinance.es`).
4. Acepta el permiso de lectura de Google Sheets.
5. La página muestra un `refresh_token`. Cópialo y pégalo en `.env.local` como `GOOGLE_OAUTH_REFRESH_TOKEN`. Reinicia el server.

Este refresh token no caduca mientras la cuenta exista y no se revoque el consentimiento. Si lo pierdes, repite los pasos.

## Setup por cada cliente con servicio Dashboard

1. La cuenta autorizada (p. ej. `tech@leanfinance.es`) ya debe tener permiso de lectura sobre el Sheet del cliente. Como esa cuenta suele ya estar añadida a los Sheets, normalmente no hay nada que hacer.
2. En el portal admin: `/admin/clientes/<id>` → tab "Servicios contratados" → añadir el servicio "Dashboard" → pegar la URL del Sheet del cliente.

## Contrato del Sheet del cliente

La app NO lee la pestaña visual de KPIs (esa depende del filtro temporal que mueve el equipo). Lee directamente las **3 pestañas crudas** y agrega en nuestro servidor según el filtro que el cliente escoja. Los nombres exactos esperados son:

| Pestaña | Columnas usadas |
|---|---|
| `facturasVentaHolded_lineas` | Fecha, Cliente, Subtotal Línea, Total Línea, Cantidad Cobrada, Estado Cliente |
| `Facturas_compra_holded` | Fecha emisión, Proveedor, Subtotal, Total, Pagado, Estado |
| `extractosBancarios` | Fecha, Importe, Conciliado, Estado |

Si el equipo cambia la posición de esas columnas, hay que actualizar `lib/google-sheets/client.ts`.

## Filtros temporales (UI cliente)

El cliente ve tabs en `/app/dashboard`:
- `<año actual> completo` (default)
- `Q1`, `Q2`, `Q3`, `Q4`
- `Último mes` (mes más reciente con datos)

La selección viaja por query string (`?period=q2`, etc.). El Sheet del equipo no se toca; cada cliente filtra lo suyo de forma independiente.

Lo que NO se renderiza en v1: tabla de movimientos bancarios detallados, filtro por cuenta bancaria, gráficos del Sheet.

## Cache

El portal cachea el render por empresa durante 10 minutos (`unstable_cache` con tag `dashboard:<companyId>`). El cliente puede forzar refresh con el botón "Actualizar" en la pantalla.
