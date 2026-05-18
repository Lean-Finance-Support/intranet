# Catálogo de servicios

Listado global de los servicios que Lean Finance ofrece a sus clientes, gestionable desde `/admin/servicios`. La página es de **lectura libre para todos los admins**; las mutaciones (crear/editar/archivar) requieren el permiso atómico `manage_services_catalog` (global, grantable, sin pertenencia a roles — se concede manualmente vía `profile_permissions`).

- Tabla `public.services` (catálogo) + `public.department_services` (M:N) + `public.company_services` (contrataciones por empresa).
- Cardinalidad servicio↔dpto: 0..N (un servicio puede ser transversal sin dpto, tener uno o pertenecer a varios).
- Slugs `tax-models` y `dashboard` son **load-bearing** (referenciados en código por gates de sidebar y OAuth Dashboard). El catálogo bloquea editar el slug y archivar el servicio (flag `is_load_bearing` en `ServiceCatalogItem`, constante `LOAD_BEARING_SERVICE_SLUGS` en `lib/types/services.ts`).
- Server actions en `app/admin/(sidebar)/servicios/actions.ts` (`listServicesCatalog`, `createService`, `updateService`, `archiveService`, `unarchiveService`).
