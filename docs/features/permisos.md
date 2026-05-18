# Sistema de permisos (admin)

Autorización basada en **permisos atómicos + roles**. Cada permiso declara qué `scope_type` admite
(`none` | `department` | `company` | `service` | `company_service`). Al asignar un rol o permiso a un
empleado se fija el scope concreto.

## Tablas

- `permissions` — catálogo (código, descripción, scope_type).
- `roles` — agrupaciones de permisos.
- `role_permissions` — qué permisos incluye cada rol.
- `profile_roles` — rol concedido a un empleado con scope concreto.
- `profile_permissions` — permiso suelto concedido directamente (excepcional).

Función central: `has_permission(uid, perm, scope_type default 'none', scope_id default NULL) returns bool`.
Helper para listar scopes: `user_scope_ids(uid, perm, scope_type) returns setof uuid`.

## Roles semilla

- **Miembro de departamento** — lectura básica (miembro, ver empresas/notificaciones del dept). Scope `department`.
- **Chief** — incluye "Miembro" + operaciones (asignar técnico, añadir servicio, crear notificaciones). Scope `department`.
- **Técnico** — `view_assigned_company` sobre una combinación empresa×servicio. Scope `company_service` (el `scope_id` referencia `company_services.id`).
- **Supervisor de apartado** — `validate_client_documentation` sobre un `client_apartado` concreto. Scope `client_apartado` (el `scope_id` referencia `documentation.client_apartados.id`). No se asigna desde la UI de roles: se otorga/revoca al asignar/quitar a alguien como supervisor de un apartado de documentación.

## Evaluación

- Para escalada de privilegios: solo quien tenga el permiso `manage_users` puede escribir en las tablas
  del propio sistema de permisos (RLS lo impone). Se bootstrapea manualmente por SQL o service role.
- Desde la app: helper `lib/require-permission.ts` (`requirePermission`, `hasPermission`, `userScopeIds`).
  Las server actions llaman a `requirePermission(perm, scope)` antes de operar.
- La RLS de las tablas de negocio sigue usando `is_admin(auth.uid())`/`is_client(auth.uid())` como
  gate grueso — la autorización fina vive en los server actions.
- **Visibilidad/lectura**: `requireAdmin()` basta; los permisos atómicos solo gatean mutaciones. No gatear
  lectura por dpto/servicio.
- La cookie `x-active-department-id` se puebla con los departamentos donde el usuario tiene
  `member_of_department` (ver `getCachedUserDepartments`).
