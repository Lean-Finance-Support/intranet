## Plan: Flujo repetible de Modelos Fiscales con estados y presentación

- **Goal:** Convertir el flujo de modelos fiscales en un ciclo repetible con estados pendiente/aceptado/rechazado, rechazo por parte del cliente, y notificación final de presentación.
- **Architecture:** DB (tax_client_responses, tax_client_submissions), admin actions + UI, client actions + UI, types
- **Tech stack:** Next.js 15, Supabase, TypeScript, Tailwind CSS 4
- **Date:** 2026-04-07

---

### Contexto y reglas de negocio

**Flujo general:**
1. Empleado rellena importes → guarda borrador → "Notificar al cliente" (repetible)
2. Cliente revisa modelos → acepta/rechaza cada uno (aceptar requiere IBAN) → "Enviar al asesor" (repetible)
3. Empleado ve respuestas → puede modificar y re-notificar
4. Al re-notificar: modelos editados vuelven a `pending`, los no editados conservan su estado
5. Cuando TODOS los modelos enviados están `accepted` → empleado puede "Notificar presentación" (email + resumen)

**Estados de cada modelo (tax_client_responses.status):**
- `pending` — el empleado ha enviado/modificado, el cliente no ha actuado
- `accepted` — el cliente ha aceptado (con IBAN obligatorio si no es informativo)
- `rejected` — el cliente ha rechazado

---

### File Map

```
lib/types/tax.ts                                          → Añadir TaxModelStatus, actualizar tipos
app/admin/(sidebar)/modelos/actions.ts                    → notifyClient repetible + reset pending + notifyPresentation
app/admin/(sidebar)/modelos/_components/notify-button.tsx  → Botón siempre visible + botón presentación
app/admin/(sidebar)/modelos/_components/models-form.tsx    → Mostrar 3 estados en columna respuesta
app/admin/(sidebar)/modelos/_components/modelos-workspace.tsx → Pasar nuevos datos al notify-button
app/app/(sidebar)/modelos/actions.ts                      → submitQuarter repetible + status en vez de approved
app/app/(sidebar)/modelos/_components/models-client-list.tsx → Aceptar/rechazar + re-editable tras envío
```

---

### Cambios en BD (Supabase)

**1. `tax_client_responses` — añadir columna `status`:**
```sql
ALTER TABLE public.tax_client_responses
ADD COLUMN status text NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending', 'accepted', 'rejected'));

-- Migrar datos existentes
UPDATE public.tax_client_responses SET status = 'accepted' WHERE approved = true;
UPDATE public.tax_client_responses SET status = 'pending' WHERE approved = false;
```

**2. `tax_client_submissions` — eliminar constraint UNIQUE para permitir re-envíos:**
```sql
ALTER TABLE public.tax_client_submissions
DROP CONSTRAINT tax_client_submissions_company_id_year_quarter_key;
```

---

### Tasks

#### Fase 1: Base de datos y tipos

[ ] 1. Ejecutar migración SQL: añadir `status` a `tax_client_responses` y migrar datos
[ ] 2. Ejecutar migración SQL: eliminar UNIQUE constraint de `tax_client_submissions`
[ ] 3. Actualizar `lib/types/tax.ts`: añadir `TaxModelStatus`, cambiar `approved` → `status` en interfaces

#### Fase 2: Admin — actions

[ ] 4. `getClientResponses`: devolver `status` en vez de `approved`
[ ] 5. `notifyClient` repetible: al re-notificar, comparar `tax_entries.updated_at` con la última `tax_notifications.notified_at`. Para entries modificados después de la última notificación, resetear `tax_client_responses.status` a `pending`
[ ] 6. `getNotificationStatus`: devolver también la última `notified_at` y si hay modelos (para UI)
[ ] 7. Nueva action `notifyPresentation(companyId, year, quarter)`: valida que todos los entries tengan status=accepted, crea notificación in-app a clientes con resumen, inserta tax_notification con tipo presentación
[ ] 8. Nueva action `canSendPresentation(companyId, year, quarter)`: retorna boolean

#### Fase 3: Admin — UI

[ ] 9. `models-form.tsx`: columna "Respuesta cliente" muestra 3 estados (Aceptado/Rechazado/Pendiente) con colores
[ ] 10. `notify-button.tsx`: siempre mostrar botón "Notificar al cliente" (con fecha de última notificación debajo). Añadir botón "Notificar presentación" cuando `canSendPresentation=true`
[ ] 11. `modelos-workspace.tsx`: conectar nueva lógica de presentación

#### Fase 4: Client — actions

[ ] 12. `getClientQuarterData`: devolver `status` en vez de `approved`, NO bloquear tras envío
[ ] 13. `saveClientResponses`: aceptar `status` en lugar de `approved`
[ ] 14. `submitQuarter`: cambiar INSERT a INSERT simple (ya sin UNIQUE constraint), permitir re-envíos

#### Fase 5: Client — UI

[ ] 15. `models-client-list.tsx`: reemplazar checkbox toggle por botones aceptar/rechazar. Aceptar requiere IBAN. Mostrar 3 estados visualmente
[ ] 16. `models-client-list.tsx`: eliminar bloqueo post-envío, permitir re-edición y re-envío
[ ] 17. `models-client-list.tsx`: banner informativo según estado (enviado, todos aceptados, hay rechazados, etc.)
