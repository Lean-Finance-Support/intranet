# Importar onboarding desde propuesta firmada

El comercial sube el PDF de una propuesta de ventas ya firmada (plantilla maestra
interna → PDF → firmada con Adobe Acrobat Sign) y la plataforma extrae los datos
para arrancar el onboarding del cliente.

Ruta: `/admin/clientes/onboarding/importar`. Acceso: mismos 3 permisos que el
onboarding (`create_company` + `manage_client_accounts` + `request_client_documentation`).

## Flujo

1. El comercial sube **un PDF** (drag/drop, máx. 25 MB). Para la extracción solo
   se usa en memoria; la copia que se conserva es la que se adjunta a la
   documentación del cliente (paso 4).
2. `extractProposal` lo manda a la **API de Claude** (bloque `document` nativo) con
   salida estructurada vía `tools`. Devuelve empresa, firmante, servicios y, si la
   propuesta la identifica como tal, la cuenta bancaria del cliente.
3. Se normaliza el NIF y se busca en `companies`:
   - **Sin fila** → `mode:"new"`: el wizard de onboarding se abre **prerrellenado**.
   - **Fila con `deleted_at`** → `mode:"soft_deleted"`: mensaje bloqueante (hay que
     restaurar la empresa primero, no se auto-restaura).
   - **Fila activa** → `mode:"existing"`: pantalla "añadir servicios" que solo
     contrata los servicios nuevos detectados (reutiliza `addServiceToCompany`, que
     ya hace auth por dpto y auto-asigna técnicos del equipo actual).
4. La propuesta se **adjunta automáticamente** al apartado «Propuesta comercial»
   (bloque «Contratos») de la documentación del cliente — ver abajo.

## Adjuntado automático a la documentación

`attachProposalToDocumentation` sube el PDF al apartado «Propuesta comercial»:

- Si el bloque/apartado del cliente no existen, se crean (el apartado es global y
  opcional). Re-importar añade una segunda/tercera propuesta al mismo apartado.
- Si el apartado estaba `validado`, se **reabre** a `pendiente` (no se puede
  adjuntar a un apartado validado).
- **Empresa existente** → el adjuntado lo hace `importProposal` en el momento de
  importar (campo `proposal_attached` en el resultado).
- **Empresa nueva** → el adjuntado se ejecuta tras cerrar el onboarding, vía el
  callback `onFinalized` del `OnboardingWizard` (la empresa no existe antes).

## Qué se extrae

- Empresa: `legal_name`, `company_name`, `nif`.
- Firmante → una cuenta asociada de cliente (`email` + `full_name`). El email se
  toma **solo** del audit report de Adobe (`Web Form filled in by Nombre (email)`).
- Servicios contratados: cada línea del presupuesto se mapea al catálogo en la
  misma llamada; el post-procesado valida que el `service_id` exista.
- Cuenta bancaria **del cliente** solo si la propuesta la identifica como tal
  (p.ej. domiciliación). La cuenta de pago a Lean Finance (BBVA) **nunca** se extrae.

Teléfono y dirección fiscal NO se extraen (el wizard no los recoge; se editan
luego en la ficha). El equipo responsable tampoco viene en la propuesta — se
asigna a mano en el paso 2 del wizard.

## Confianza del matching

Cada servicio trae `confidence: "high" | "low" | "none"`:

- `high` → se preselecciona en el wizard / pantalla de añadir servicios.
- `low` → la IA mapeó la línea a un servicio pero con dudas; nunca se
  auto-selecciona y se avisa con el servicio candidato.
- `none` → la línea no corresponde a ningún servicio del catálogo; se avisa
  como línea sin servicio.

`importProposal` agrupa los avisos en `ProposalServiceWarnings`
(`low_confidence` + `unmatched`). Se muestran en el banner del paso 1 (rama
nueva, prop `importWarnings` del `OnboardingWizard`) y en la pantalla de añadir
servicios (rama existente).

## Archivos

- `lib/proposal-import/` (server-only salvo `to-onboarding-state.ts`, que es puro):
  - `types.ts` — `ProposalExtraction`, `ImportProposalResult` (unión por `mode`).
  - `extract.ts` — `extractProposal()` + `parseExtractionResponse()`; constante
    `EXTRACTION_MODEL`. Prompt caching (`cache_control: ephemeral`) en el bloque
    estable (instrucciones + catálogo).
  - `nif.ts` — `normalizeNif()` (upper + quita espacios/puntos/guiones) y
    `looksLikeValidNif()`.
  - `to-onboarding-state.ts` — `proposalToOnboardingState()`, mapper puro a
    `Partial<OnboardingState>`.
- `app/admin/(sidebar)/clientes/onboarding/importar/` — `page.tsx`, `actions.ts`
  (`importProposal`, `addServicesFromProposal`) y `_components/`
  (`importar-proposal.tsx`, `anadir-servicios-confirm.tsx`).
- `onboarding-wizard.tsx` — prop opcional `initialState` (prerrelleno) + `importHints`.

## Configuración

Requiere la env var **`ANTHROPIC_API_KEY`** (server-only). Modelo en la constante
`EXTRACTION_MODEL` de `extract.ts` (por defecto `claude-sonnet-4-6`).

## Tests

`npm test` (vitest) — cubre `normalizeNif`, `looksLikeValidNif`,
`proposalToOnboardingState`, `parseExtractionResponse` (incl. post-procesado del
matching) y el error de `ANTHROPIC_API_KEY` ausente.
