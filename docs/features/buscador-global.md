# Buscador global (Cmd/Ctrl+K)

Paleta tipo Spotlight disponible en ambos espacios (admin y cliente). Se abre con `Cmd/Ctrl+K` o con el botón "Buscar" del sidebar. Permite navegar a páginas y, en admin, saltar directamente a la ficha de un cliente o a vistas de servicio por cliente (p.ej. "Modelos fiscales de {cliente}", "Dashboard de {cliente}").

## Arquitectura

- `lib/search/registry.ts` — **registry estático** de páginas (`PAGE_ENTRIES`). Cada entrada: `id`, `space` (`admin` | `client`), `label`, `path` (sin prefijo, lo añade `getLinkPrefix`), `icon`, `keywords[]`, y opcional `gate(ctx)` para condicionarla a permisos/servicios contratados.
- `lib/search/` — builder de destinos dinámicos (empresas, vistas por cliente), matching con normalización de acentos, tokens AND y bonus por match al inicio.
- `lib/actions/search.ts` — `getSearchableCompanies()` cacheada 5min con tag `search:companies`. Si cambias datos relevantes de empresas, `revalidateTag("search:companies")`.
- `components/search/{search-provider,search-palette,search-trigger,icons}.tsx` — provider con context + listener global de teclado. Integrada en `app/admin/(sidebar)/layout.tsx` y `app/app/(sidebar)/layout.tsx`; los layouts pasan al ctx `role`, `hasTaxModels`, `hasDashboard`, `companies`, `activeCompanyId` ya resueltos.

## ⚠️ MANTENIMIENTO — al crear nueva sección, página o vista por cliente

Cada vez que se añada una nueva ruta navegable o una nueva vista por cliente, hay que registrarla en el buscador. Es fácil olvidarlo y deja la UX coja.

Checklist al introducir algo nuevo:

1. **Página estática (admin o cliente)** → añadir una entrada en `PAGE_ENTRIES` de `lib/search/registry.ts` con `space`, `label`, `path`, `icon`, `keywords` (sinónimos en castellano e inglés que pueda teclear el usuario) y `gate` si depende de un permiso/servicio.
2. **Vista por cliente accesible desde admin** (estilo `/admin/clientes/[id]/<algo>` o `/admin/<servicio>?company=...`) → además de la entrada estática, extender el builder de destinos dinámicos en `lib/search/` para que aparezca un resultado "{Servicio} de {cliente}" por cada empresa que tenga ese servicio activo. Usar el mismo patrón que `Modelos fiscales de {cliente}` / `Dashboard de {cliente}`.
3. **Nuevo servicio contratable** que añada un item al sidebar del cliente (como `dashboard` o `tax-models`) → ampliar el ctx del provider (`hasDashboard`/`hasTaxModels`/…) y añadir el `gate` correspondiente a la entrada cliente.
4. **Cambia el icono disponible** → registrar el nuevo símbolo en `components/search/icons.tsx`.
5. **Probar Cmd/Ctrl+K** en ambos espacios tecleando uno de los `keywords` para verificar que aparece y que el destino navega bien (recordar que las rutas se prefijan vía `getLinkPrefix`, **no** hardcodear `/admin/` ni `/app/`).

Acciones rápidas (botones "+ Nuevo …") y apartados de documentación **están deliberadamente fuera del buscador** — no añadirlos sin discutirlo. Solo van páginas + destinos por cliente. **Excepción**: "Nuevo cliente" sí está en el buscador; al ser un modal (no una ruta), su entrada apunta a `/clientes?nuevo=1` y `ClientesPage` abre el modal al detectar ese parámetro.
