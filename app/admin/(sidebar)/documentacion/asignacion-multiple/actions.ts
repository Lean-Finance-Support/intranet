"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission, requirePermission } from "@/lib/require-permission";
import { createAdminClient } from "@/lib/supabase/server";
import {
  notifyDocumentationSupervisors,
  buildSummary,
  getActorAndApartadoLabel,
} from "@/lib/notifications/documentation";
import { isValidDocumentationEmailTemplateSlug } from "@/lib/documentation/email-templates";
import { invalidateResponsibleTeam } from "@/lib/team-queries";
import type {
  ApartadoTemplate,
  ApartadoTemplateFile,
  BlockTemplate,
  DocumentationTag,
} from "@/lib/types/documentation";

// ────────────────────────────────────────────────────────────────────────────
// Tipos del workspace
// ────────────────────────────────────────────────────────────────────────────

export interface BulkAssignmentCompany {
  id: string;
  name: string; // company_name ?? legal_name
  legal_name: string;
  // Cuántos perfiles cliente están vinculados a la empresa. La edge function
  // de email reparte un envío por cada uno, así que la previsualización del
  // submit usa este número para estimar el total de emails.
  client_count: number;
}

export interface BulkAssignmentEligibleAdmin {
  id: string;
  full_name: string | null;
  email: string;
  department_ids: string[]; // departamentos donde es miembro o chief
}

export interface BulkAssignmentData {
  blocks: BlockTemplate[];
  departments: { id: string; name: string }[];
  tags: DocumentationTag[];
  companies: BulkAssignmentCompany[];
  admins: BulkAssignmentEligibleAdmin[];
}

// ────────────────────────────────────────────────────────────────────────────
// Loader
// ────────────────────────────────────────────────────────────────────────────

export async function loadBulkAssignmentData(): Promise<BulkAssignmentData> {
  await requireAdmin();
  if (!(await hasPermission("request_client_documentation"))) {
    throw new Error("Sin permisos para asignar documentación");
  }

  const admin = createAdminClient();

  const [
    { data: blocks },
    { data: apartados },
    { data: deptLinks },
    { data: depts },
    { data: templates },
    { data: companies },
    { data: roles },
  ] = await Promise.all([
    admin
      .schema("documentation")
      .from("blocks")
      .select("id, name, slug, description, display_order")
      .order("display_order")
      .order("name"),
    admin
      .schema("documentation")
      .from("apartados")
      .select("id, block_id, name, description, display_order, is_global, is_optional_global, email_template_slug, kind, slug")
      .order("display_order")
      .order("name"),
    admin
      .schema("documentation")
      .from("apartado_departments")
      .select("apartado_id, department_id, is_optional"),
    admin.from("departments").select("id, name").order("name"),
    admin
      .schema("documentation")
      .from("apartado_templates")
      .select("id, apartado_id, file_name, file_size, mime_type, uploaded_at, storage_path"),
    admin
      .from("companies")
      .select("id, legal_name, company_name")
      .order("legal_name"),
    // Admins miembros/chiefs de un departamento → fuente de elegibilidad
    admin
      .from("profile_roles")
      .select("scope_id, profile_id, role:roles(name), profile:profiles(id, full_name, email)")
      .eq("scope_type", "department"),
  ]);

  // Conteo de perfiles cliente por empresa (para estimar emails en el preview).
  const { data: profileCompanyLinks } = await admin
    .from("profile_companies")
    .select("company_id");
  const clientCountByCompany = new Map<string, number>();
  for (const link of profileCompanyLinks ?? []) {
    const cid = link.company_id as string;
    clientCountByCompany.set(cid, (clientCountByCompany.get(cid) ?? 0) + 1);
  }

  // Apartados con sus departments (con is_optional) y plantillas-archivo
  const apartadoDeptMap = new Map<
    string,
    { department_id: string; is_optional: boolean }[]
  >();
  for (const link of deptLinks ?? []) {
    const list = apartadoDeptMap.get(link.apartado_id as string) ?? [];
    list.push({
      department_id: link.department_id as string,
      is_optional: (link.is_optional as boolean | null) ?? false,
    });
    apartadoDeptMap.set(link.apartado_id as string, list);
  }

  // Tags + apartado_tags
  const [{ data: tagRows }, { data: apartadoTagLinks }] = await Promise.all([
    admin
      .schema("documentation")
      .from("tags")
      .select("id, slug, name, description"),
    admin
      .schema("documentation")
      .from("apartado_tags")
      .select("apartado_id, tag_id"),
  ]);
  const apartadoTagMap = new Map<string, string[]>();
  for (const link of apartadoTagLinks ?? []) {
    const list = apartadoTagMap.get(link.apartado_id as string) ?? [];
    list.push(link.tag_id as string);
    apartadoTagMap.set(link.apartado_id as string, list);
  }

  const templatesByApartado = new Map<string, ApartadoTemplateFile[]>();
  for (const t of templates ?? []) {
    const aid = t.apartado_id as string;
    const list = templatesByApartado.get(aid) ?? [];
    list.push({
      id: t.id as string,
      apartado_id: aid,
      file_name: t.file_name as string,
      file_size: t.file_size as number,
      mime_type: t.mime_type as string,
      uploaded_at: t.uploaded_at as string,
      storage_path: t.storage_path as string,
    });
    templatesByApartado.set(aid, list);
  }

  const apartadosByBlock = new Map<string, ApartadoTemplate[]>();
  for (const a of apartados ?? []) {
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
      templates: templatesByApartado.get(a.id as string) ?? [],
      email_template_slug: (a.email_template_slug as string | null) ?? null,
    });
    apartadosByBlock.set(a.block_id as string, arr);
  }

  const blocksTpl: BlockTemplate[] = (blocks ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    slug: b.slug as string,
    description: (b.description as string | null) ?? null,
    display_order: b.display_order as number,
    apartados: apartadosByBlock.get(b.id as string) ?? [],
  }));

  // Empresas
  const companyList: BulkAssignmentCompany[] = (companies ?? []).map((c) => ({
    id: c.id as string,
    legal_name: c.legal_name as string,
    name: ((c.company_name as string | null) ?? (c.legal_name as string)) || "(sin nombre)",
    client_count: clientCountByCompany.get(c.id as string) ?? 0,
  }));

  // Admins elegibles: profiles únicos con sus department_ids agregados
  const adminsMap = new Map<string, BulkAssignmentEligibleAdmin>();
  for (const r of roles ?? []) {
    const role = r.role as unknown as { name: string } | null;
    if (!role) continue;
    if (role.name !== "Miembro de departamento" && role.name !== "Chief") continue;
    const profile = r.profile as unknown as {
      id: string;
      full_name: string | null;
      email: string;
    } | null;
    if (!profile) continue;
    const deptId = r.scope_id as string | null;
    if (!deptId) continue;
    const existing = adminsMap.get(profile.id);
    if (existing) {
      if (!existing.department_ids.includes(deptId)) {
        existing.department_ids.push(deptId);
      }
    } else {
      adminsMap.set(profile.id, {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        department_ids: [deptId],
      });
    }
  }
  const adminsList = [...adminsMap.values()].sort((a, b) =>
    (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email)
  );

  const tagsList: DocumentationTag[] = (tagRows ?? []).map((t) => ({
    id: t.id as string,
    slug: t.slug as string,
    name: t.name as string,
    description: (t.description as string | null) ?? null,
  }));

  return {
    blocks: blocksTpl,
    departments: ((depts ?? []) as { id: string; name: string }[]),
    tags: tagsList,
    companies: companyList,
    admins: adminsList,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Mutación: asignación masiva
// ────────────────────────────────────────────────────────────────────────────

export interface BulkAssignInput {
  apartadoIds: string[];
  companyIds: string[];
  // Por apartado: lista de profile_ids que serán supervisores en cada
  // instancia creada para ese apartado en cualquiera de las empresas.
  supervisorsByApartado: Record<string, string[]>;
  // Por apartado con plantilla: si se debe enviar el email asociado.
  sendEmailByApartado: Record<string, boolean>;
  // Apartados que se crearán con is_optional = true. Solo aplica a las
  // instancias nuevas; las que ya existen no se tocan.
  optionalApartadoIds?: string[];
}

export interface BulkAssignResult {
  apartadoCount: number;
  companyCount: number;
  instancesCreated: number;
  instancesSkipped: number; // ya existían
  supervisorsAssigned: number;
  emailsSent: number;
  emailErrors: string[];
}

export async function bulkAssign(input: BulkAssignInput): Promise<BulkAssignResult> {
  const { user } = await requirePermission("request_client_documentation");
  const adminCli = createAdminClient();

  if (input.apartadoIds.length === 0) {
    throw new Error("Selecciona al menos un apartado");
  }
  if (input.companyIds.length === 0) {
    throw new Error("Selecciona al menos una empresa");
  }

  // 1. Cargar metadata de los apartados elegidos: block_id, is_global, depts,
  //    email_template_slug, name (para summary del email/notif)
  const { data: apartados } = await adminCli
    .schema("documentation")
    .from("apartados")
    .select("id, block_id, name, is_global, email_template_slug")
    .in("id", input.apartadoIds);
  if (!apartados || apartados.length !== input.apartadoIds.length) {
    throw new Error("Algún apartado seleccionado ya no existe");
  }

  // dept_ids por apartado (para validar elegibilidad de supervisores)
  const { data: apartadoDeptRows } = await adminCli
    .schema("documentation")
    .from("apartado_departments")
    .select("apartado_id, department_id")
    .in("apartado_id", input.apartadoIds);
  const apartadoDeptMap = new Map<string, string[]>();
  for (const row of apartadoDeptRows ?? []) {
    const arr = apartadoDeptMap.get(row.apartado_id as string) ?? [];
    arr.push(row.department_id as string);
    apartadoDeptMap.set(row.apartado_id as string, arr);
  }

  // 2. Validar plantilla de email: slug debe existir en el catálogo de TS
  for (const a of apartados) {
    const slug = a.email_template_slug as string | null;
    if (slug && !isValidDocumentationEmailTemplateSlug(slug)) {
      throw new Error(
        `El apartado "${a.name as string}" tiene una plantilla de email desconocida (${slug})`
      );
    }
  }

  // 3. Validar elegibilidad de cada supervisor para su apartado.
  //    Se cargan los miembros (Miembro de departamento / Chief) por dept; un
  //    profile es elegible si su intersección con dept_ids del apartado ≠ ∅,
  //    o si el apartado es global y el profile pertenece a CUALQUIER dept.
  const allSupervisorIds = new Set<string>();
  for (const list of Object.values(input.supervisorsByApartado)) {
    for (const id of list) allSupervisorIds.add(id);
  }

  const supervisorDepts = new Map<string, string[]>(); // profile_id -> dept_ids
  if (allSupervisorIds.size > 0) {
    const { data: rows } = await adminCli
      .from("profile_roles")
      .select("profile_id, scope_id, role:roles(name)")
      .eq("scope_type", "department")
      .in("profile_id", [...allSupervisorIds]);
    for (const r of rows ?? []) {
      const role = r.role as unknown as { name: string } | null;
      if (!role) continue;
      if (role.name !== "Miembro de departamento" && role.name !== "Chief") continue;
      const pid = r.profile_id as string;
      const did = r.scope_id as string;
      if (!pid || !did) continue;
      const arr = supervisorDepts.get(pid) ?? [];
      if (!arr.includes(did)) arr.push(did);
      supervisorDepts.set(pid, arr);
    }
  }

  for (const a of apartados) {
    const aid = a.id as string;
    const supList = input.supervisorsByApartado[aid] ?? [];
    if (supList.length === 0) continue;
    const aptDepts = apartadoDeptMap.get(aid) ?? [];
    const isGlobal = a.is_global as boolean;
    for (const supId of supList) {
      const supDepts = supervisorDepts.get(supId) ?? [];
      if (supDepts.length === 0) {
        throw new Error(
          `El supervisor seleccionado para "${a.name as string}" no es miembro de ningún departamento`
        );
      }
      if (!isGlobal) {
        const intersect = supDepts.some((d) => aptDepts.includes(d));
        if (!intersect) {
          throw new Error(
            `El supervisor seleccionado no pertenece a los departamentos del apartado "${a.name as string}"`
          );
        }
      }
    }
  }

  const optionalSet = new Set(input.optionalApartadoIds ?? []);

  // 4. Resolver role_id "Supervisor de apartado"
  const { data: roleRow } = await adminCli
    .from("roles")
    .select("id")
    .eq("name", "Supervisor de apartado")
    .single();
  const supervisorRoleId = roleRow?.id as string | undefined;
  if (!supervisorRoleId) throw new Error("Rol 'Supervisor de apartado' no encontrado");

  // 5. Para cada empresa: asegurar client_blocks de los bloques implicados
  //    (uno por bloque distinto), e insertar client_apartados que falten.
  const blockIdsInUse = [...new Set(apartados.map((a) => a.block_id as string))];

  let instancesCreated = 0;
  let instancesSkipped = 0;
  let supervisorsAssigned = 0;
  let emailsSent = 0;
  const emailErrors: string[] = [];
  const webhookSecret = process.env.WEBHOOK_SECRET;

  for (const companyId of input.companyIds) {
    // 5a. client_blocks
    const { data: existingClientBlocks } = await adminCli
      .schema("documentation")
      .from("client_blocks")
      .select("id, block_id")
      .eq("company_id", companyId)
      .in("block_id", blockIdsInUse);
    const cbByBlockId = new Map<string, string>(
      (existingClientBlocks ?? []).map((cb) => [cb.block_id as string, cb.id as string])
    );
    const missingBlockIds = blockIdsInUse.filter((bid) => !cbByBlockId.has(bid));
    if (missingBlockIds.length > 0) {
      const { data: newBlocks, error: cbErr } = await adminCli
        .schema("documentation")
        .from("client_blocks")
        .insert(
          missingBlockIds.map((bid) => ({
            company_id: companyId,
            block_id: bid,
            added_by: user.id,
          }))
        )
        .select("id, block_id");
      if (cbErr) throw new Error(`Error creando bloques en empresa ${companyId}: ${cbErr.message}`);
      for (const nb of newBlocks ?? []) {
        cbByBlockId.set(nb.block_id as string, nb.id as string);
      }
    }

    // 5b. client_apartados — instancias por apartado
    for (const a of apartados) {
      const aid = a.id as string;
      const clientBlockId = cbByBlockId.get(a.block_id as string);
      if (!clientBlockId) continue;

      // ¿ya existe?
      const { data: existing } = await adminCli
        .schema("documentation")
        .from("client_apartados")
        .select("id")
        .eq("client_block_id", clientBlockId)
        .eq("apartado_id", aid)
        .maybeSingle();

      let clientApartadoId: string;
      if (existing) {
        clientApartadoId = existing.id as string;
        instancesSkipped++;
      } else {
        const { data: newCa, error: caErr } = await adminCli
          .schema("documentation")
          .from("client_apartados")
          .insert({
            client_block_id: clientBlockId,
            apartado_id: aid,
            added_by: user.id,
            is_optional: optionalSet.has(aid),
          })
          .select("id")
          .single();
        if (caErr) throw new Error(`Error creando apartado para empresa ${companyId}: ${caErr.message}`);
        clientApartadoId = newCa!.id as string;
        instancesCreated++;
        await adminCli
          .schema("documentation")
          .from("apartado_status_history")
          .insert({
            client_apartado_id: clientApartadoId,
            from_status: null,
            to_status: "pendiente",
            changed_by: user.id,
            reason: "Asignación múltiple",
          });
      }

      // 5c. Supervisores: insertar profile_roles (idempotente vía conflict)
      const supList = input.supervisorsByApartado[aid] ?? [];
      for (const supId of supList) {
        const { error: roleErr } = await adminCli
          .from("profile_roles")
          .insert({
            profile_id: supId,
            role_id: supervisorRoleId,
            scope_type: "client_apartado",
            scope_id: clientApartadoId,
          });
        if (roleErr) {
          // Si ya existe, ignoramos (constraint profile_roles_unique)
          const msg = roleErr.message ?? "";
          if (!/duplicate|unique/i.test(msg)) {
            console.error(
              `[bulkAssign] error insertando supervisor ${supId} en ${clientApartadoId}:`,
              msg
            );
          }
        } else {
          supervisorsAssigned++;
        }
      }

      // 5d. Notificación in-app a supervisores asignados (para los que sean nuevos
      //     y para los que ya estaban). Mismo patrón que el flujo individual.
      if (supList.length > 0) {
        const { actorName, actorEmail, apartadoName } = await getActorAndApartadoLabel(
          user.id,
          clientApartadoId
        );
        await notifyDocumentationSupervisors({
          clientApartadoId,
          actorId: user.id,
          summary: buildSummary(actorName, actorEmail, "te asignó como supervisor", apartadoName),
        });
      }

      // 5e. Email transaccional con plantilla asociada
      const slug = a.email_template_slug as string | null;
      const sendEmail = !!slug && input.sendEmailByApartado[aid] === true;
      if (sendEmail) {
        if (!webhookSecret) {
          emailErrors.push(
            `empresa ${companyId} / apartado "${a.name as string}": WEBHOOK_SECRET no configurado`
          );
        } else {
          const { data: invokeData, error: invokeErr } = await adminCli.functions.invoke(
            "notify-documentation-template-email",
            {
              body: {
                company_id: companyId,
                client_apartado_id: clientApartadoId,
                template_slug: slug,
                sent_by_id: user.id,
              },
              headers: { "x-webhook-secret": webhookSecret },
            }
          );
          if (invokeErr) {
            const detail =
              invokeData && typeof invokeData === "object" && "error" in invokeData
                ? String((invokeData as { error: unknown }).error)
                : invokeErr.message;
            emailErrors.push(`empresa ${companyId} / apartado "${a.name as string}": ${detail}`);
          } else {
            const sentN =
              invokeData && typeof invokeData === "object" && "sent" in invokeData
                ? Number((invokeData as { sent: number }).sent)
                : 0;
            emailsSent += sentN;
          }
        }
      }
    }
  }

  // Invalidar el equipo responsable de cada empresa afectada y su caché de
  // documentación (al asignar bloques/apartados cambia el listado del cliente).
  for (const companyId of input.companyIds) {
    invalidateResponsibleTeam(companyId);
    updateTag(`doc:client:${companyId}`);
  }

  // Revalidar páginas que muestran apartados/clientes
  revalidatePath("/admin/documentacion");
  revalidatePath("/admin/clientes");

  return {
    apartadoCount: input.apartadoIds.length,
    companyCount: input.companyIds.length,
    instancesCreated,
    instancesSkipped,
    supervisorsAssigned,
    emailsSent,
    emailErrors,
  };
}
