# Onboarding automático desde propuesta de ventas firmada

## Context

Hoy un onboarding de cliente se rellena 100% a mano en el wizard de 4 pasos
(`/admin/clientes/onboarding`). Cuando un comercial cierra una venta tiene ya un PDF
de propuesta firmada (plantilla maestra interna → exportada a PDF → firmada con Adobe
Acrobat Sign) que contiene casi todos los datos necesarios: razón social, NIF,
dirección fiscal, teléfono, datos del firmante y los servicios contratados.

El objetivo es que el comercial **suba ese PDF** y la plataforma extraiga la información
para arrancar el onboarding automáticamente:

- **Empresa nueva** (NIF no existe) → abre el wizard de onboarding **prerrellenado**;
  el comercial revisa, asigna el equipo responsable (los técnicos NO vienen en la
  propuesta) y confirma.
- **Empresa existente** (NIF ya en BD) → pantalla enfocada de **"añadir servicios"** que
  solo contrata los servicios nuevos detectados, con auto-asignación de técnicos del
  equipo actual.

La extracción se hace con la **API de Claude** (soporte PDF nativo), decisión del
usuario. La plantilla es estable pero la tabla de servicios del presupuesto es texto
libre, y un LLM la mapea al catálogo con más fiabilidad que un fuzzy match.

### Estructura confirmada del PDF (ejemplo Tracsia)

- Página **"Aceptación y firma"**: `CIF Empresa`, `Nombre Empresa`, `Dirección Fiscal`,
  `Teléfono contacto`, firmante (`Nombre`, `Apellidos`, `Rango Social`, `DNI/NIF`).
- Tabla **presupuesto** (slide 6): columnas `Descripción | Importe`, servicios en texto
  libre (p.ej. `"Servicio Solicitud ENISA"` → catálogo `prestamo-enisa`).
- **Audit report de Adobe Acrobat Sign** (última página): el email del firmante aparece
  como `Web Form filled in by Nombre (email)`.
- ⚠️ La cuenta bancaria que aparece (slide 7, BBVA) es la **de Lean Finance** (donde paga
  el cliente) — NO es cuenta del cliente y NUNCA se extrae. Solo se extrae un IBAN si la
  propuesta lo identifica explícitamente como **del cliente** (p.ej. domiciliación).

## Decisiones tomadas

- **Motor**: API de Claude con bloque `document` (PDF base64 nativo). Modelo por defecto
  `claude-sonnet-4-6` (configurable en una constante; Opus si se necesita más precisión).
- **Matching de servicios**: en la **misma llamada** — se incluye el catálogo de 47
  servicios en la parte cacheada del prompt y el modelo devuelve el `service_id` por
  línea del presupuesto. Post-procesado solo valida que el id exista.
- **Prefill del wizard**: prop opcional `initialState` en `OnboardingWizard` con
  inicializador perezoso de `useState` — tipado, sin navegación, cero regresión en la
  ruta `/onboarding` actual.
- **Empresa existente**: pantalla inline de confirmación que reutiliza
  `addServiceToCompany` (ya hace auth por dpto + `autoAssignTechniciansForNewService`).
- **Acceso**: mismos permisos que onboarding (`create_company` + `manage_client_accounts`
  + `request_client_documentation`).
- **PDF**: se procesa en memoria, no se persiste en Storage.
- **Info extraída** — se extrae y prerrellena: empresa (`legal_name`, `company_name`,
  `nif`), firmante → cuenta asociada de cliente (email + nombre), servicios contratados,
  y la cuenta bancaria del cliente **si la propuesta la identifica como tal**. Teléfono y
  dirección fiscal NO se extraen (el wizard no los recoge; se editan luego en la ficha).

## Implementación

### 1. Dependencia + env var

- Añadir `@anthropic-ai/sdk` a `package.json` (`npm install`).
- Nueva env var **`ANTHROPIC_API_KEY`** (server-only, nunca `NEXT_PUBLIC_`) en
  `.env.local` y en Vercel (dev primero, luego prod — ver `feedback_dev_before_prod`).
- Documentar en `CLAUDE.md` (sección "Variables de entorno").

### 2. Módulo de extracción — `lib/proposal-import/` (server-only)

- **`types.ts`**:
  - `ProposalExtraction { company: {legal_name, company_name, nif}, signer: {name,
    surname, dni, email}, services: {raw_text, service_id|null,
    confidence: "high"|"low"|"none"}[], client_bank_account: {iban, bank_name?, label?}
    | null }` — `client_bank_account` es SOLO la del cliente; `null` si no la hay o si la
    única cuenta del PDF es la de Lean Finance.
  - `ImportProposalResult` (unión discriminada por `mode`, ver §4).
- **`extract.ts`** — `extractProposal(pdfBytes: Buffer, catalog): Promise<ProposalExtraction>`:
  - Cliente `Anthropic` con `process.env.ANTHROPIC_API_KEY` (error claro si falta).
  - `messages` con bloque `document` (base64 PDF, `media_type: application/pdf`) + texto.
  - **Salida estructurada vía `tools`**: definir una tool con `input_schema` JSON y leer
    el `tool_use`; parseo defensivo.
  - **Prompt caching** (`cache_control: ephemeral`) en el bloque estable: instrucciones de
    campos + catálogo de 47 servicios + reglas clave:
    - email del firmante SOLO del audit report de Adobe (`Web Form filled in by ...`);
    - `client_bank_account`: extraer un IBAN SOLO si la propuesta lo identifica como del
      cliente (domiciliación de pagos del cliente); la cuenta de pago a Lean Finance
      NUNCA se extrae → si solo aparece esa, devolver `null`;
    - devolver `nif` tal cual (la normalización es posterior).
  - Constante `EXTRACTION_MODEL` centralizada.
- **`nif.ts`** — `normalizeNif(raw)`: upper + quita espacios/puntos/guiones (misma
  convención que `finalizeOnboarding`). Chequeo ligero de validez → solo flag de aviso.
- **`to-onboarding-state.ts`** — `proposalToOnboardingState(result, { canManageBankAccounts }):
  Partial<OnboardingState>` (mapper puro): `legal_name`, `company_name`, `nif` normalizado;
  `client_accounts` = un `OnboardingClientAccountState` con email del firmante +
  `full_name` = `"${name} ${surname}"`; `selected_service_ids` = solo matches
  `confidence:"high"`; `bank_accounts` = un `OnboardingBankAccountState` (con `genId()`) si
  `client_bank_account` no es `null` **y** `canManageBankAccounts`, si no `[]`.

### 3. Ruta y UI de subida — `/admin/clientes/onboarding/importar`

- **`app/admin/(sidebar)/clientes/onboarding/importar/page.tsx`** (server): espeja
  `onboarding/page.tsx` — `getOnboardingData()`, guard de los 3 permisos, redirect a
  `${linkPrefix}/clientes` si no. Pasa `OnboardingPageData` al componente cliente.
- **`_components/importar-proposal.tsx`** (client): drag/drop de 1 PDF, pre-check cliente
  (mime + 25MB), estado de carga "Extrayendo datos…", y render por rama (§5/§6).
  Diseño admin: header `bg-brand-navy`, card blanca, acentos `brand-teal`.
- **`components/clientes-page.tsx`** (~líneas 374-384): nuevo `Link` "Importar propuesta"
  junto a "+ Nuevo onboarding", mismo gate `canManageClientAccounts &&
  canRequestDocumentation`, estilo secundario/outline (no compite con el ámbar primario).

### 4. Server action — `importar/actions.ts` (`"use server"`)

- `importProposal({ fileName, mimeType, base64 }): Promise<ImportProposalResult>`:
  - `requireAdmin()` + `requirePermission` de los 3 permisos.
  - `validateUpload(...)` de `lib/storage/upload-validation.ts` (PDF + 25MB).
  - Decodifica base64 → `Buffer`; carga catálogo (`services` activos); `extractProposal`.
  - `normalizeNif`; busca empresa: `companies.select(...).eq("nif", nif).maybeSingle()`.
  - Ramas: `mode:"new"` (sin fila) · `mode:"soft_deleted"` (fila con `deleted_at`) ·
    `mode:"existing"` (fila activa → calcula `new_services` = matched − ya contratados).
- `addServicesFromProposal(companyId, serviceIds[])`: re-chequea `deleted_at`; por cada
  servicio llama `addServiceToCompany` de `app/admin/clientes/actions.ts` (ya hace auth
  `write_dept_service` por dpto + `autoAssignTechniciansForNewService`); tolerante a
  fallo parcial, devuelve resumen por servicio.

### 5. Rama EMPRESA NUEVA — wizard prerrellenado

- `onboarding-wizard.tsx`: añadir prop opcional `initialState?: Partial<OnboardingState>`;
  `useState<OnboardingState>(() => ({ ...initialOnboardingState, ...initialState }))`.
  Sin `initialState` (ruta `/onboarding` actual) → comportamiento idéntico.
- `importar-proposal.tsx` en `mode:"new"` renderiza `<OnboardingWizard data linkPrefix
  initialState={proposalToOnboardingState(result)} />` inline (la page ya trae los datos).
- Banner en Paso 1: "Datos importados de la propuesta — revísalos". Listar
  `services` con `confidence:"low"`/`none` como sugerencias a elegir a mano en Paso 2.
- `finalizeOnboarding` se usa sin cambios.

### 6. Rama EMPRESA EXISTENTE — pantalla "añadir servicios"

- `_components/anadir-servicios-confirm.tsx` (inline en `mode:"existing"`): card de la
  empresa; lista de `new_services` con checkbox premarcado (nombre + texto de propuesta
  que matcheó); sección muda "ya contratados"; aviso de `raw` no reconocidos.
- Confirmar → `addServicesFromProposal`; al terminar, link a `${linkPrefix}/clientes/{id}`.
- Casos borde: todos ya contratados → "Todos los servicios ya están contratados", sin
  botón. `mode:"soft_deleted"` → mensaje bloqueante "restaura la empresa primero", sin
  auto-restaurar.

### 7. Manejo de errores

- Fallo de extracción (API, JSON malformado, falta API key) → mensaje claro en español,
  reintento, fichero conservado.
- Matches `low`/`none` → nunca auto-seleccionados/auto-contratados; se muestran como
  sugerencias.
- `raw` sin match → aviso en ambas ramas (nada se descarta en silencio).
- NIF malformado → flag de aviso, no bloquea (se corrige en Paso 1).
- Sin email de firmante → `client_accounts` con email vacío; la validación del Paso 1 ya
  obliga a rellenarlo.

## Archivos

**Crear:**
- `lib/proposal-import/{types,extract,nif,to-onboarding-state}.ts`
- `app/admin/(sidebar)/clientes/onboarding/importar/page.tsx`
- `app/admin/(sidebar)/clientes/onboarding/importar/actions.ts`
- `app/admin/(sidebar)/clientes/onboarding/importar/_components/importar-proposal.tsx`
- `app/admin/(sidebar)/clientes/onboarding/importar/_components/anadir-servicios-confirm.tsx`
- `docs/features/onboarding-import.md`

**Modificar:**
- `app/admin/(sidebar)/clientes/onboarding/_components/onboarding-wizard.tsx` — prop `initialState`
- `components/clientes-page.tsx` — botón "Importar propuesta"
- `lib/search/registry.ts` — entrada `PAGE_ENTRIES` para `/clientes/onboarding/importar`
- `CLAUDE.md` — env var `ANTHROPIC_API_KEY` + módulo `lib/proposal-import/`
- `package.json` — `@anthropic-ai/sdk`

**Reutilizar (sin tocar):** `getOnboardingData`, `finalizeOnboarding`, `lookupExistingClientByEmail`,
`addServiceToCompany` + `autoAssignTechniciansForNewService`, `validateUpload`, `requirePermission`,
`getLinkPrefix`.

## Verificación

TDD (skill `test-driven-development`): si no hay runner, añadir `vitest`. Tests primero:

- `normalizeNif` — quita espacios/puntos/guiones, upper, idempotente.
- `proposalToOnboardingState` — mapeo correcto; firmante → 1 cuenta con nombre unido;
  solo `high` en `selected_service_ids`; `bank_accounts` con 1 entrada si hay
  `client_bank_account` y `canManageBankAccounts`, `[]` si falta cualquiera de los dos.
- Post-procesado de matching — `service_id` desconocido → `confidence:"none"`.
- Parseo de extracción — fixture de respuesta del modelo → `ProposalExtraction` válido;
  JSON malformado → error claro. SDK de Anthropic mockeado (no API real en unit tests).

End-to-end manual (Mario verifica visualmente — `feedback_verification`):
1. PDF firmado real (Tracsia), empresa NUEVA → wizard abre prerrellenado; email del
   firmante del audit report; la cuenta BBVA de Lean Finance NO aparece como banco del
   cliente; asignar equipo a mano; finalizar OK.
1b. Propuesta con IBAN del cliente (domiciliación) → ese IBAN sí prerrellena
   `bank_accounts` (con usuario `manage_bank_accounts`).
2. Reimportar el mismo PDF con la empresa ya creada → "añadir servicios" muestra solo los
   nuevos; confirmar los contrata; técnicos auto-asignados del equipo actual.
3. Propuesta con todos los servicios ya contratados → estado "todos ya contratados".
4. NIF de empresa archivada (`deleted_at`) → mensaje bloqueante.
5. Fichero no-PDF o >25MB → rechazo con mensaje claro.
6. Usuario sin permisos → redirigido fuera de `/importar`.

Verificar también Cmd/Ctrl+K → "importar propuesta" navega a la página nueva.
