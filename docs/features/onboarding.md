# Onboarding de cliente

Flujo de alta integral en `/admin/clientes/onboarding` (botón **"+ Nuevo onboarding"** debajo de "+ Nuevo cliente" en `/admin/clientes`). Wizard de 4 pasos:

1. **Datos** — datos básicos de empresa, cuentas bancarias (opcionales, solo si `manage_bank_accounts`), cuentas asociadas (≥1 obligatoria, con prebúsqueda por email tipo `findClientProfileByEmail` para vincular cuentas existentes).
2. **Equipo responsable** — selector de **servicios contratados** (no de departamentos; los dpts responsables se derivan vía `department_services`). Miembros del equipo por dpto derivado (≥1 por dpto). Dos checkboxes condicionales: "Cliente no viene de Holded" y "Solicita Alta de Empresa" (este último se habilita si algún servicio contratado pertenece a Asesoría Laboral). Si todos los servicios son transversales (sin dpto), el wizard avisa y permite seguir con solo documentación global.
3. **Documentación inicial** — listado editable de apartados sugeridos según los dpts derivados + tags. Permite añadir/quitar (bloque entero o apartado suelto), togglear opcional y editar supervisores agrupados por dpto.
4. **Confirmación** — resumen, finalización transaccional + email de bienvenida.

Acceso: requiere los 3 permisos `create_company` + `manage_client_accounts` + `request_client_documentation` (hoy solo concedidos manualmente vía `profile_permissions`; no hay rol que los aglutine).

Al finalizar, `finalizeOnboarding` inserta `company_services` para los servicios elegidos y, para cada miembro del equipo, inserta filas en `profile_roles`:
- Rol **Técnico** con `scope_type=company_service` para cada servicio del dpto del miembro.
- Rol **Supervisor de apartado** con `scope_type=client_apartado` para los apartados del cliente vinculados al dpto del miembro.

Server actions: `app/admin/(sidebar)/clientes/onboarding/actions.ts` (`getOnboardingData`, `lookupExistingClientByEmail`, `finalizeOnboarding`).

Email de bienvenida: edge function `notify-client-onboarding-welcome` (un único email a las cuentas asociadas en TO, con CC a supervisores y chiefs de los deptos implicados; tarjetas clickables `mailto:` por técnico). Necesita `verify_jwt = false` en `supabase/config.toml` para que el server action pueda invocarla con service role.
