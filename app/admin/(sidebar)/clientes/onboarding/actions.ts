"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission, requirePermission } from "@/lib/require-permission";
import { getAuthUser } from "@/lib/cached-queries";
import { createAdminClient } from "@/lib/supabase/server";
import { invalidateResponsibleTeam } from "@/lib/team-queries";
import type {
  ApartadoTemplate,
  BlockTemplate,
  ApartadoDepartmentLink,
  DocumentationTag,
} from "@/lib/types/documentation";

// ───────────────────────────────────────────────────────────────────────────
// Tipos compartidos cliente/servidor
// ───────────────────────────────────────────────────────────────────────────

export interface OnboardingDeptMember {
  id: string;
  full_name: string | null;
  email: string;
}

export interface OnboardingDepartment {
  id: string;
  name: string;
  members: OnboardingDeptMember[];
  // El profile_id del Chief del depto (uno o ninguno) — se incluye en CC del
  // email de bienvenida.
  chief_id: string | null;
}

export interface OnboardingServiceItem {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  department_ids: string[];
  department_names: string[];
}

export interface OnboardingPageData {
  departments: OnboardingDepartment[];
  services: OnboardingServiceItem[];
  blocks: BlockTemplate[];
  tags: DocumentationTag[];
  canCreate: boolean;
  canManageBankAccounts: boolean;
  canManageClientAccounts: boolean;
  canRequestDocumentation: boolean;
}

export interface OnboardingClientAccount {
  email: string;
  full_name: string | null;
}

export interface OnboardingBankAccount {
  iban: string;
  label: string | null;
  bank_name: string | null;
}

export interface OnboardingApartadoPlan {
  apartado_id: string;
  block_id: string;
  is_optional: boolean;
  supervisor_ids: string[];
}

export interface OnboardingFinalizeInput {
  // Paso 1
  legal_name: string;
  company_name: string;
  nif: string;
  bank_accounts: OnboardingBankAccount[];
  client_accounts: OnboardingClientAccount[];
  // Paso 2 — Equipo responsable
  // Servicios contratados (resuelven los departamentos derivados vía department_services).
  service_ids: string[];
  // Equipo responsable agrupado por dpto derivado.
  // El miembro se persiste como Técnico de todos los servicios del dpto contratados
  // y como Supervisor de los apartados del cliente vinculados al dpto.
  team_by_dept: Record<string, string[]>;
  // Paso 3 (resumen final tras edición)
  apartados: OnboardingApartadoPlan[];
}

export interface OnboardingFinalizeResult {
  company_id: string;
  client_account_count: number;
  apartado_count: number;
  email_sent: number;
  email_failed: number;
  // Si el email falló, devolvemos el detalle (mensaje de Resend o de invocación)
  // para mostrarlo en la UI y depurar sin tener que abrir los logs.
  email_error: string | null;
}

// ───────────────────────────────────────────────────────────────────────────
// Loader inicial
// ───────────────────────────────────────────────────────────────────────────

export async function getOnboardingData(): Promise<OnboardingPageData> {
  await requireAdmin();
  const admin = createAdminClient();

  const [
    { data: depts },
    { data: roleRows },
    { data: profiles },
    { data: blockRows },
    { data: apartadoRows },
    { data: deptLinks },
    { data: tagRows },
    { data: apartadoTagLinks },
    { data: rolesCatalog },
    { data: servicesRows },
    { data: deptServicesLinks },
    canCreate,
    canManageBankAccounts,
    canManageClientAccounts,
    canRequestDocumentation,
  ] = await Promise.all([
    admin.from("departments").select("id, name").order("name"),
    admin
      .from("profile_roles")
      .select("profile_id, scope_id, role_id")
      .eq("scope_type", "department"),
    admin.from("profiles").select("id, full_name, email"),
    admin
      .schema("documentation")
      .from("blocks")
      .select("id, name, slug, description, display_order")
      .order("display_order"),
    admin
      .schema("documentation")
      .from("apartados")
      .select("id, block_id, name, description, display_order, is_global, is_optional_global, email_template_slug, kind, slug")
      .order("display_order"),
    admin
      .schema("documentation")
      .from("apartado_departments")
      .select("apartado_id, department_id, is_optional"),
    admin
      .schema("documentation")
      .from("tags")
      .select("id, slug, name, description")
      .order("name"),
    admin.schema("documentation").from("apartado_tags").select("apartado_id, tag_id"),
    admin.from("roles").select("id, name"),
    admin
      .from("services")
      .select("id, name, slug, display_order")
      .eq("is_active", true)
      .order("display_order")
      .order("name"),
    admin
      .from("department_services")
      .select("service_id, department_id")
      .eq("is_active", true),
    hasPermission("create_company"),
    hasPermission("manage_bank_accounts"),
    hasPermission("manage_client_accounts"),
    hasPermission("request_client_documentation"),
  ]);

  const profileMap = new Map<string, OnboardingDeptMember>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id as string, {
      id: p.id as string,
      full_name: (p.full_name as string | null) ?? null,
      email: p.email as string,
    });
  }

  const roleNameMap = new Map<string, string>();
  for (const r of rolesCatalog ?? []) {
    roleNameMap.set(r.id as string, r.name as string);
  }

  const memberByDept = new Map<string, OnboardingDeptMember[]>();
  const seen = new Set<string>(); // dept|profile
  const chiefByDept = new Map<string, string>();
  for (const link of roleRows ?? []) {
    const roleName = roleNameMap.get(link.role_id as string);
    if (!roleName) continue;
    if (roleName !== "Miembro de departamento" && roleName !== "Chief") continue;
    const deptId = link.scope_id as string;
    const profileId = link.profile_id as string;
    if (!deptId || !profileId) continue;
    const profile = profileMap.get(profileId);
    if (!profile) continue;
    const key = `${deptId}|${profileId}`;
    if (!seen.has(key)) {
      seen.add(key);
      const list = memberByDept.get(deptId) ?? [];
      list.push(profile);
      memberByDept.set(deptId, list);
    }
    if (roleName === "Chief" && !chiefByDept.has(deptId)) {
      chiefByDept.set(deptId, profileId);
    }
  }

  const departments: OnboardingDepartment[] = (depts ?? []).map((d) => ({
    id: d.id as string,
    name: d.name as string,
    members: (memberByDept.get(d.id as string) ?? []).sort((a, b) =>
      (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email)
    ),
    chief_id: chiefByDept.get(d.id as string) ?? null,
  }));

  // Servicios + sus dpts derivados (M:N).
  const deptNameById = new Map<string, string>();
  for (const d of depts ?? []) deptNameById.set(d.id as string, d.name as string);
  const deptIdsByService = new Map<string, string[]>();
  for (const link of deptServicesLinks ?? []) {
    const sid = link.service_id as string;
    const list = deptIdsByService.get(sid) ?? [];
    list.push(link.department_id as string);
    deptIdsByService.set(sid, list);
  }
  const services: OnboardingServiceItem[] = (servicesRows ?? []).map((s) => {
    const sid = s.id as string;
    const dids = deptIdsByService.get(sid) ?? [];
    return {
      id: sid,
      name: s.name as string,
      slug: s.slug as string,
      display_order: s.display_order as number,
      department_ids: dids,
      department_names: dids.map((d) => deptNameById.get(d) ?? "").filter((n) => n),
    };
  });

  // Blocks + apartados con sus deptos (con is_optional) y tags
  const apartadoDeptMap = new Map<string, ApartadoDepartmentLink[]>();
  for (const link of deptLinks ?? []) {
    const list = apartadoDeptMap.get(link.apartado_id as string) ?? [];
    list.push({
      department_id: link.department_id as string,
      is_optional: (link.is_optional as boolean | null) ?? false,
    });
    apartadoDeptMap.set(link.apartado_id as string, list);
  }
  const apartadoTagMap = new Map<string, string[]>();
  for (const link of apartadoTagLinks ?? []) {
    const list = apartadoTagMap.get(link.apartado_id as string) ?? [];
    list.push(link.tag_id as string);
    apartadoTagMap.set(link.apartado_id as string, list);
  }

  const apartadosByBlock = new Map<string, ApartadoTemplate[]>();
  for (const a of apartadoRows ?? []) {
    const arr = apartadosByBlock.get(a.block_id as string) ?? [];
    const deptLinks = apartadoDeptMap.get(a.id as string) ?? [];
    arr.push({
      id: a.id as string,
      block_id: a.block_id as string,
      name: a.name as string,
      description: (a.description as string | null) ?? null,
      display_order: a.display_order as number,
      is_global: a.is_global as boolean,
      is_optional_global: (a.is_optional_global as boolean | null) ?? false,
      kind: ((a as { kind?: "file" | "form" }).kind ?? "file") as "file" | "form",
      slug: ((a as { slug?: string | null }).slug ?? null) as string | null,
      department_ids: deptLinks.map((d) => d.department_id),
      departments: deptLinks,
      tag_ids: apartadoTagMap.get(a.id as string) ?? [],
      templates: [],
      email_template_slug: (a.email_template_slug as string | null) ?? null,
    });
    apartadosByBlock.set(a.block_id as string, arr);
  }

  const blocks: BlockTemplate[] = (blockRows ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    slug: b.slug as string,
    description: (b.description as string | null) ?? null,
    display_order: b.display_order as number,
    apartados: apartadosByBlock.get(b.id as string) ?? [],
  }));

  const tags: DocumentationTag[] = (tagRows ?? []).map((t) => ({
    id: t.id as string,
    slug: t.slug as string,
    name: t.name as string,
    description: (t.description as string | null) ?? null,
  }));

  return {
    departments,
    services,
    blocks,
    tags,
    canCreate,
    canManageBankAccounts,
    canManageClientAccounts,
    canRequestDocumentation,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Lookup auxiliar — comprueba si un email ya tiene profile (para mostrar
// aviso en el wizard antes de finalizar).
// ───────────────────────────────────────────────────────────────────────────

export async function lookupExistingClientByEmail(email: string): Promise<{
  exists: boolean;
  profile_id: string | null;
  full_name: string | null;
  alreadyLinkedTo: { id: string; legal_name: string }[];
} | null> {
  await requireAdmin();
  await requirePermission("manage_client_accounts");
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .eq("email", cleanEmail)
    .maybeSingle();
  if (!profile) {
    return { exists: false, profile_id: null, full_name: null, alreadyLinkedTo: [] };
  }
  if (profile.role !== "client") {
    throw new Error("Ese email pertenece a un empleado interno; no puede asociarse como cliente.");
  }
  const { data: links } = await admin
    .from("profile_companies")
    .select("company:companies(id, legal_name)")
    .eq("profile_id", profile.id as string);
  const alreadyLinkedTo = (links ?? [])
    .map((l) => l.company as unknown as { id: string; legal_name: string } | null)
    .filter((c): c is { id: string; legal_name: string } => c !== null);
  return {
    exists: true,
    profile_id: profile.id as string,
    full_name: (profile.full_name as string | null) ?? null,
    alreadyLinkedTo,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// finalizeOnboarding — la transacción "grande". Crea empresa + cuentas
// bancarias + cuentas asociadas + bloques/apartados con supervisores y
// dispara el email de bienvenida.
//
// No es atómico estricto (Supabase JS no expone transacciones) pero el orden
// está pensado para que un fallo a mitad deje el sistema con datos parciales
// recuperables (la empresa queda creada, se puede continuar manualmente).
// ───────────────────────────────────────────────────────────────────────────

export async function finalizeOnboarding(
  input: OnboardingFinalizeInput
): Promise<OnboardingFinalizeResult> {
  await requireAdmin();
  await requirePermission("create_company");
  await requirePermission("manage_client_accounts");
  await requirePermission("request_client_documentation");
  if (input.bank_accounts.length > 0) {
    await requirePermission("manage_bank_accounts");
  }
  const { user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  // Validaciones de entrada
  const legalName = input.legal_name.trim();
  const companyName = input.company_name.trim();
  const nif = input.nif.trim().toUpperCase();
  if (!legalName || !companyName || !nif) {
    throw new Error("Razón social, nombre comercial y NIF/CIF son obligatorios.");
  }
  if (input.client_accounts.length === 0) {
    throw new Error("Debes añadir al menos una cuenta asociada.");
  }
  if (input.service_ids.length === 0) {
    throw new Error("Debes seleccionar al menos un servicio contratado.");
  }
  for (const ca of input.client_accounts) {
    if (!ca.email.trim()) throw new Error("Hay una cuenta asociada sin email.");
  }
  for (const ba of input.bank_accounts) {
    if (!ba.iban.trim()) throw new Error("Hay una cuenta bancaria sin IBAN.");
  }
  // Si todos los servicios son transversales (sin dpto), apartados puede salir
  // vacío — eso es válido (cliente solo recibe documentación global, que se
  // computa fuera del bucle de dpts). Solo bloqueamos si hay deptos derivados
  // y aun así no se ha asignado nada.
  // Cada apartado requiere ≥1 supervisor.
  for (const a of input.apartados) {
    if (a.supervisor_ids.length === 0) {
      throw new Error(
        "Hay apartados sin supervisor asignado. Revisa la documentación inicial."
      );
    }
  }

  const admin = createAdminClient();

  // 1. Crear empresa
  const { data: createdCompany, error: companyErr } = await admin
    .from("companies")
    .insert({
      legal_name: legalName,
      company_name: companyName,
      nif,
    })
    .select("id, legal_name, company_name")
    .single();
  if (companyErr || !createdCompany) {
    throw new Error(`No se pudo crear la empresa: ${companyErr?.message ?? "desconocido"}`);
  }
  const companyId = createdCompany.id as string;

  // 1.5. Servicios contratados + asignación de técnicos derivada del equipo
  //      responsable. Se ejecuta antes de cuentas bancarias para que cualquier
  //      fallo aquí deje la empresa con servicios ya configurados (recuperable
  //      desde la ficha si fuera necesario continuar manualmente).
  const { data: insertedCs, error: csErr } = await admin
    .from("company_services")
    .upsert(
      input.service_ids.map((sid) => ({
        company_id: companyId,
        service_id: sid,
        is_active: true,
      })),
      { onConflict: "company_id,service_id" }
    )
    .select("id, service_id");
  if (csErr || !insertedCs) {
    throw new Error(
      `Empresa creada (id=${companyId}). Error al añadir servicios: ${csErr?.message ?? "?"}`
    );
  }
  const csIdByServiceId = new Map<string, string>();
  for (const row of insertedCs) {
    csIdByServiceId.set(row.service_id as string, row.id as string);
  }

  // Resolver dpts derivados (active department_services para los services elegidos)
  // y construir csIds por dpto para asignar técnicos.
  const { data: derivedLinks } = await admin
    .from("department_services")
    .select("service_id, department_id")
    .in("service_id", input.service_ids)
    .eq("is_active", true);
  const derivedDeptIdsSet = new Set<string>();
  const csIdsByDept = new Map<string, string[]>();
  for (const link of derivedLinks ?? []) {
    const did = link.department_id as string;
    const sid = link.service_id as string;
    derivedDeptIdsSet.add(did);
    const csId = csIdByServiceId.get(sid);
    if (csId) {
      const list = csIdsByDept.get(did) ?? [];
      if (!list.includes(csId)) list.push(csId);
      csIdsByDept.set(did, list);
    }
  }
  const derivedDeptIds = [...derivedDeptIdsSet];

  // Insertar técnicos para cada (miembro del equipo del dpto, company_service.id).
  // Idempotente — si alguien repite el wizard, no se duplica nada.
  const tecnicoRoleId = await lookupRoleIdByName(admin, "Técnico");
  const techRows: {
    profile_id: string;
    role_id: string;
    scope_type: string;
    scope_id: string;
  }[] = [];
  for (const [deptId, memberIds] of Object.entries(input.team_by_dept)) {
    if (!derivedDeptIdsSet.has(deptId)) continue; // dpto no derivado de servicios contratados → ignorar
    const csIds = csIdsByDept.get(deptId) ?? [];
    for (const memberId of memberIds) {
      for (const csId of csIds) {
        techRows.push({
          profile_id: memberId,
          role_id: tecnicoRoleId,
          scope_type: "company_service",
          scope_id: csId,
        });
      }
    }
  }
  if (techRows.length > 0) {
    const { error: techErr } = await admin
      .from("profile_roles")
      .upsert(techRows, { onConflict: "profile_id,role_id,scope_type,scope_id", ignoreDuplicates: true });
    if (techErr) {
      throw new Error(
        `Empresa creada (id=${companyId}). Error al asignar técnicos: ${techErr.message}`
      );
    }
  }

  // 2. Cuentas bancarias (idempotente; la primera marcada is_default)
  if (input.bank_accounts.length > 0) {
    const rows = input.bank_accounts.map((ba, idx) => ({
      company_id: companyId,
      iban: ba.iban.replace(/\s/g, "").toUpperCase(),
      label: ba.label?.trim() || null,
      bank_name: ba.bank_name?.trim() || null,
      is_default: idx === 0,
    }));
    const { error: baErr } = await admin.from("company_bank_accounts").insert(rows);
    if (baErr) {
      throw new Error(`Empresa creada, pero error al añadir cuentas bancarias: ${baErr.message}`);
    }
  }

  // 3. Cuentas asociadas (auth.users + profile_companies)
  interface ResolvedClient {
    profile_id: string;
    email: string;
    full_name: string | null;
  }
  const resolvedClients: ResolvedClient[] = [];
  for (const ca of input.client_accounts) {
    const email = ca.email.trim().toLowerCase();
    const fullName = ca.full_name?.trim() || null;

    let authUserId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { role: "client", full_name: fullName },
    });

    if (createErr) {
      const msg = createErr.message?.toLowerCase() ?? "";
      const alreadyExists =
        createErr.status === 422 ||
        createErr.code === "email_exists" ||
        msg.includes("already") ||
        msg.includes("registered");
      if (!alreadyExists) {
        throw new Error(
          `Empresa creada (id=${companyId}). Error al crear la cuenta ${email}: ${createErr.message}`
        );
      }
      const { data: existing } = await admin
        .from("profiles")
        .select("id, full_name")
        .eq("email", email)
        .maybeSingle();
      if (!existing) {
        throw new Error(
          `Empresa creada (id=${companyId}). El email ${email} ya está registrado pero no se localizó el profile.`
        );
      }
      authUserId = existing.id as string;
    } else {
      authUserId = created.user?.id ?? null;
    }
    if (!authUserId) {
      throw new Error(`Empresa creada. No se pudo determinar el usuario para ${email}.`);
    }

    if (fullName) {
      await admin.from("profiles").update({ full_name: fullName }).eq("id", authUserId);
    }

    const { error: linkErr } = await admin
      .from("profile_companies")
      .upsert(
        { profile_id: authUserId, company_id: companyId },
        { onConflict: "profile_id,company_id", ignoreDuplicates: true }
      );
    if (linkErr) {
      throw new Error(
        `Empresa creada. Error al vincular ${email} con la empresa: ${linkErr.message}`
      );
    }
    resolvedClients.push({ profile_id: authUserId, email, full_name: fullName });
  }

  // 4. Documentación inicial — agrupar apartados por block_id, crear
  //    client_blocks (uno por bloque) e insertar client_apartados con
  //    supervisores como profile_roles(client_apartado).
  const apartadosByBlock = new Map<string, OnboardingApartadoPlan[]>();
  for (const a of input.apartados) {
    const list = apartadosByBlock.get(a.block_id) ?? [];
    list.push(a);
    apartadosByBlock.set(a.block_id, list);
  }

  const supervisorRoleId = await lookupSupervisorRoleId(admin);

  const allClientApartadoIds: string[] = [];
  for (const [blockId, plans] of apartadosByBlock) {
    const { data: cb, error: cbErr } = await admin
      .schema("documentation")
      .from("client_blocks")
      .insert({
        company_id: companyId,
        block_id: blockId,
        added_by: user.id,
      })
      .select("id")
      .single();
    if (cbErr || !cb) {
      throw new Error(`Error al asignar bloque al cliente: ${cbErr?.message ?? "?"}`);
    }
    const clientBlockId = cb.id as string;

    const { data: cas, error: caErr } = await admin
      .schema("documentation")
      .from("client_apartados")
      .insert(
        plans.map((p, idx) => ({
          client_block_id: clientBlockId,
          apartado_id: p.apartado_id,
          added_by: user.id,
          display_order: idx,
          is_optional: p.is_optional,
        }))
      )
      .select("id, apartado_id");
    if (caErr || !cas) {
      throw new Error(`Error al crear apartados del cliente: ${caErr?.message ?? "?"}`);
    }

    const supRows: {
      profile_id: string;
      role_id: string;
      scope_type: string;
      scope_id: string;
    }[] = [];
    for (const ca of cas) {
      const plan = plans.find((p) => p.apartado_id === (ca.apartado_id as string));
      if (!plan) continue;
      allClientApartadoIds.push(ca.id as string);
      for (const sid of plan.supervisor_ids) {
        supRows.push({
          profile_id: sid,
          role_id: supervisorRoleId,
          scope_type: "client_apartado",
          scope_id: ca.id as string,
        });
      }
    }
    if (supRows.length > 0) {
      const { error: supErr } = await admin.from("profile_roles").insert(supRows);
      if (supErr) {
        throw new Error(`Error al asignar supervisores: ${supErr.message}`);
      }
    }
  }

  // 5. Email de bienvenida — invocación a edge function, no bloqueante por
  //    fallos individuales (los devolvemos en el resultado, incluyendo el
  //    detalle del error si lo hay para depurarlo desde la UI).
  let emailSent = 0;
  let emailFailed = 0;
  let emailError: string | null = null;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    emailFailed = resolvedClients.length;
    emailError = "WEBHOOK_SECRET no configurado en el servidor";
    console.error("[onboarding] WEBHOOK_SECRET no configurado — omitiendo welcome email");
  } else {
    try {
      const supervisorIds = uniq(input.apartados.flatMap((a) => a.supervisor_ids));
      const { data: invokeResult, error: invokeErr } = await admin.functions.invoke(
        "notify-client-onboarding-welcome",
        {
          body: {
            company_id: companyId,
            sent_by_id: user.id,
            to_profile_ids: resolvedClients.map((c) => c.profile_id),
            cc_supervisor_ids: supervisorIds,
            cc_department_ids: derivedDeptIds,
          },
          headers: { "x-webhook-secret": webhookSecret },
        }
      );
      if (invokeErr) {
        emailFailed = resolvedClients.length;
        emailError = `Invocación: ${invokeErr.message}`;
        console.error("[onboarding] error invocando welcome email:", invokeErr.message);
      } else if (invokeResult && typeof invokeResult === "object") {
        const r = invokeResult as {
          sent?: number;
          failed?: number;
          error?: string;
          reason?: string;
        };
        emailSent = r.sent ?? 0;
        emailFailed = r.failed ?? 0;
        if (emailFailed > 0 || emailSent === 0) {
          emailError = r.error ?? r.reason ?? "Resend no devolvió detalle";
        }
      } else {
        emailFailed = resolvedClients.length;
        emailError = "La edge function no devolvió respuesta válida";
      }
    } catch (e) {
      emailFailed = resolvedClients.length;
      emailError = e instanceof Error ? e.message : String(e);
      console.error("[onboarding] excepción invocando welcome email:", e);
    }
  }

  invalidateResponsibleTeam(companyId);
  updateTag(`doc:client:${companyId}`);
  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${companyId}`);

  return {
    company_id: companyId,
    client_account_count: resolvedClients.length,
    apartado_count: allClientApartadoIds.length,
    email_sent: emailSent,
    email_failed: emailFailed,
    email_error: emailError,
  };
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

let _supervisorRoleId: string | null = null;
async function lookupSupervisorRoleId(
  admin: ReturnType<typeof createAdminClient>
): Promise<string> {
  if (_supervisorRoleId) return _supervisorRoleId;
  const { data, error } = await admin
    .from("roles")
    .select("id")
    .eq("name", "Supervisor de apartado")
    .single();
  if (error || !data) throw new Error("Rol 'Supervisor de apartado' no encontrado");
  _supervisorRoleId = data.id as string;
  return _supervisorRoleId;
}

const _roleIdByName = new Map<string, string>();
async function lookupRoleIdByName(
  admin: ReturnType<typeof createAdminClient>,
  name: string
): Promise<string> {
  const cached = _roleIdByName.get(name);
  if (cached) return cached;
  const { data, error } = await admin
    .from("roles")
    .select("id")
    .eq("name", name)
    .single();
  if (error || !data) throw new Error(`Rol '${name}' no encontrado`);
  const id = data.id as string;
  _roleIdByName.set(name, id);
  return id;
}
