# Equipo responsable (gestión post-onboarding)

El equipo responsable es una **entidad explícita**: la tabla `public.company_team_members (company_id, profile_id, added_at, added_by)` es la fuente de verdad de quién está en el equipo de un cliente. Hasta el rediseño se derivaba de quién tenía rol Técnico, lo que impedía representar a un miembro sin asignaciones y mezclaba tres conceptos. Helper `getCompanyResponsibleTeam` en `lib/team-queries.ts` (lee de `company_team_members`, agrupa por dpto, anota técnico/chief), cacheado por `companyId`.

## Invariantes del modelo

- **Técnico ⟹ equipo.** No se puede ser técnico de un servicio de un cliente sin estar en su equipo. Asignar un técnico que no estaba (`assignTechnicianAdmin`, `assignAllTechniciansAdmin`) lo inserta automáticamente en `company_team_members` (helper `addCompanyTeamMembers` en `lib/team-queries.ts`).
- **Supervisor ⇏ equipo.** Se puede ser supervisor de un apartado sin estar en el equipo; asignar supervisor (`addSupervisor`, asignación múltiple) no toca `company_team_members`.
- **Granularidad intacta.** Técnico (por servicio) y supervisor (por apartado) siguen siendo asignaciones finas editables una a una en los tabs "Servicios contratados" y "Documentación". El equipo no las elimina; las contiene.

## Operaciones en la ficha del cliente (`/admin/clientes/[id]` tab "Equipo responsable")

- **Añadir empleado al equipo** (`addTeamMemberToCompany`): inserta en `company_team_members` y **siembra** filas `profile_roles` — técnico de cada servicio contratado de su(s) dpto(s) + supervisor de cada apartado del cliente vinculado a su(s) dpto(s) y de los globales. Tras sembrar, todo es editable de forma fina.
- **Quitar empleado del equipo** (`removeTeamMemberFromCompany`): borra la fila de `company_team_members` y **todas** sus filas `profile_roles` de este cliente (técnico de cualquier servicio + supervisor de cualquier apartado), sin acotar por dpto.

## Hooks automáticos de siembra

- Al contratar un servicio nuevo (`addServiceToCompany` → `autoAssignTechniciansForNewService`): los miembros del equipo que pertenecen a alguno de los dpts del servicio se autoasignan como técnicos del nuevo `company_service`. No se mete a nadie nuevo en el equipo.
- Al añadir un apartado de doc. a un cliente (`addApartadoToClient` → `getTeamSupervisorsForApartado`): los miembros del equipo de los dpts del apartado se autoasignan como supervisores; si el apartado es global, todo el equipo.
- En la pantalla de asignación múltiple (`/admin/documentacion/asignacion-multiple`): el paso 3 (supervisores) viene **pre-seleccionado** con los miembros del equipo de las empresas elegidas que son elegibles para cada apartado, y el usuario puede editarlo. La sugerencia se deriva en cliente desde `BulkAssignmentData.teamMembers`; al tocar un apartado, su selección pasa a ser manual.

Permiso: `write_dept_service` con scope `department` — el actor solo puede añadir/quitar empleados de los dpts que gestiona. `addTeamMemberToCompany` siembra sobre el subset de dpts autorizados; `removeTeamMemberFromCompany` exige permiso en ≥1 dpto del empleado y entonces desvincula por completo.

Backfill: la migración `20260515130000_company_team_members.sql` pobló la tabla con los técnicos existentes (Opción A — los supervisores puros no entraron).
