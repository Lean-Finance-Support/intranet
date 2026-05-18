# Documentación por cliente (schema `documentation`)

Catálogo de **bloques** y **apartados** validables que se asignan a cada cliente. Cada apartado tiene un estado (`pendiente | enviado | validado | rechazado`), N supervisores (cualquier miembro/chief de los departamentos del apartado, incluso de varios deptos a la vez), archivos del cliente, comentarios bidireccionales y un historial de transiciones. Los apartados del catálogo pueden tener **plantillas** descargables como ayuda al cliente.

## Matriz de documentación inicial — opcionalidad y tags

El catálogo soporta dos ejes adicionales que se usan tanto al asignar manualmente como en el wizard de onboarding:

- **Opcionalidad per-departamento** (`documentation.apartado_departments.is_optional`): un mismo apartado puede ser obligatorio para un dpto y opcional para otro. Resolución multi-dpto: un apartado es opcional en un onboarding si **todos** los deptos seleccionados que lo cubren lo marcan como opcional (basta uno mandatory para que sea obligatorio).
- **Opcionalidad para apartados globales** (`documentation.apartados.is_optional_global`): solo aplica si `is_global = true` (un CHECK lo impone a nivel BD). Marca el apartado como "opcional por defecto" en sugerencias y pre-marca el toggle al asignarlo. "Propuesta comercial" y "Tratamiento de datos" están seed-marcados como opcionales.
- **Tags** (`documentation.tags` + `documentation.apartado_tags`): condiciones extra que activan documentación. Un apartado con tags solo se incluye en el onboarding si **todos** sus tags tienen su checkbox marcado en el wizard. Tags semilla:
  - `cliente_no_viene_de_holded` — apartados que solo se piden cuando el cliente no está integrado con Holded (rosa en la matriz Excel original).
  - `solicita_alta_empresa` — apartados específicos del alta empresa (p.ej. "Cuestionario si es alta de empresa"). El catálogo bloquea este tag si el apartado no incluye Asesoría Laboral.

## Schema, storage y permisos

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

## Apartados kind='form' (sin archivos)

Casos del catálogo en los que el cliente aporta **datos estructurados** en lugar de archivos. Hoy: "Alta en el portal de ENISA" (usuario + contraseña) y "Listado de competidores" (lista repetible {comercial, fiscal, CIF}).

- Schema: `documentation.apartados.kind ∈ ('file','form')` + `apartados.slug` (único cuando kind='form'). El payload del cliente vive en `documentation.client_apartados.form_response` JSONB.
- Validadores compartidos cliente/admin en `lib/documentation/form-payloads.ts` (no es "use server", lo importan ambas server actions).
- UI: componente React por slug en `components/documentation/forms/<slug>.tsx`. Dispatcher en `forms/index.tsx`. Patrón uniforme: prop `canEdit` controla edición; admin con `validate_documentation` o supervisor del apartado puede rellenar el form en nombre del cliente.
- Server actions: `submitFormApartado` (cliente) y `adminSubmitFormApartado` (admin con `authorizeValidation`). **Ambos transicionan** `pendiente`/`rechazado` → `enviado` (a diferencia de `adminUploadApartadoFile` que no transiciona — un form se rellena entero, no por partes).
- ENISA — cifrado AES-256-GCM en `lib/crypto/enisa.ts`. Key en env `ENISA_ENCRYPTION_KEY` (32 bytes base64, generada con `openssl rand -base64 32`). **Una key distinta por entorno**, ambas con backup en 1Password (LeanFinance/Intranet). Sin la key, las contraseñas almacenadas son irrecuperables. Descifrado on-demand vía server action `getDecryptedEnisaPassword` gateado por `authorizeValidation` (Chief o Supervisor del apartado).
- Si surge un 3er apartado kind='form': añadir slug a `FormApartadoSlug`, shape a `FormResponseBySlug`, validador a `form-payloads.ts`, componente bajo `forms/<slug>.tsx`, y extender el switch de los 2 server actions. NO construir form-builder genérico.
