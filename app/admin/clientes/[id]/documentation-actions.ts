"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission, userScopeIds } from "@/lib/require-permission";
import { getAuthUser } from "@/lib/cached-queries";
import { createAdminClient } from "@/lib/supabase/server";
import {
  DOCUMENTATION_BUCKET,
  buildClientTemplateDownloadName,
  buildDocumentationStoragePath,
  getDocumentationSignedUrl,
} from "@/lib/storage/documentation";
import {
  buildSummary,
  getActorAndApartadoLabel,
  notifyDocumentationClients,
} from "@/lib/notifications/documentation";
import type {
  ApartadoStatus,
  ApartadoSupervisor,
  ApartadoTemplateFile,
  BlockTemplate,
  ClientDocumentation,
  DepartmentMember,
} from "@/lib/types/documentation";

// ────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ────────────────────────────────────────────────────────────────────────────

async function requireRequestPermission(): Promise<void> {
  if (!(await hasPermission("request_client_documentation"))) {
    throw new Error("Sin permisos");
  }
}

async function getApartadoMeta(apartadoId: string): Promise<{
  is_global: boolean;
  department_ids: string[];
}> {
  const admin = createAdminClient();
  const [{ data: apartado }, { data: links }] = await Promise.all([
    admin.schema("documentation").from("apartados").select("is_global").eq("id", apartadoId).single(),
    admin.schema("documentation").from("apartado_departments").select("department_id").eq("apartado_id", apartadoId),
  ]);
  if (!apartado) throw new Error("Apartado no encontrado");
  return {
    is_global: apartado.is_global as boolean,
    department_ids: (links ?? []).map((l) => l.department_id as string),
  };
}

async function logStatusChange(
  clientApartadoId: string,
  fromStatus: ApartadoStatus | null,
  toStatus: ApartadoStatus,
  changedBy: string,
  reason?: string
) {
  const admin = createAdminClient();
  await admin.schema("documentation").from("apartado_status_history").insert({
    client_apartado_id: clientApartadoId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: changedBy,
    reason: reason ?? null,
  });
}

/** Verifica que el profile sea miembro/chief de algún depto del apartado. */
async function ensureProfileInApartadoDept(
  profileId: string,
  meta: { is_global: boolean; department_ids: string[] }
): Promise<{ department_id: string | null }> {
  const admin = createAdminClient();
  if (!meta.is_global) {
    const { data: rows } = await admin
      .from("profile_roles")
      .select("scope_id, role:roles(name)")
      .eq("profile_id", profileId)
      .eq("scope_type", "department")
      .in("scope_id", meta.department_ids);
    const match = (rows ?? []).find((r) => {
      const role = r.role as unknown as { name: string } | null;
      return role && (role.name === "Miembro de departamento" || role.name === "Chief");
    });
    if (!match) throw new Error("El supervisor no pertenece a ningún departamento del apartado");
    return { department_id: (match.scope_id as string) ?? null };
  }
  const { data: rows } = await admin
    .from("profile_roles")
    .select("scope_id, role:roles(name)")
    .eq("profile_id", profileId)
    .eq("scope_type", "department")
    .limit(1);
  const match = (rows ?? []).find((r) => {
    const role = r.role as unknown as { name: string } | null;
    return role && (role.name === "Miembro de departamento" || role.name === "Chief");
  });
  if (!match) throw new Error("El supervisor debe pertenecer a algún departamento");
  return { department_id: (match.scope_id as string) ?? null };
}

// ────────────────────────────────────────────────────────────────────────────
// Loaders
// ────────────────────────────────────────────────────────────────────────────

export async function getClientDocumentation(companyId: string): Promise<ClientDocumentation> {
  await requireAdmin();
  const admin = createAdminClient();

  const [
    { data: clientBlocks },
    { data: clientApartados },
    { data: blocks },
    { data: apartados },
    { data: deptLinks },
    { data: deptRows },
    { data: company },
  ] = await Promise.all([
    admin
      .schema("documentation")
      .from("client_blocks")
      .select("id, company_id, block_id, display_order, added_by, added_at")
      .eq("company_id", companyId),
    admin
      .schema("documentation")
      .from("client_apartados")
      .select(
        "id, client_block_id, apartado_id, status, display_order, is_optional, validated_at, validated_by, rejected_at, rejected_by, last_rejection_reason"
      ),
    admin
      .schema("documentation")
      .from("blocks")
      .select("id, name, slug, description, display_order"),
    admin
      .schema("documentation")
      .from("apartados")
      .select("id, name, description, is_global"),
    admin
      .schema("documentation")
      .from("apartado_departments")
      .select("apartado_id, department_id"),
    admin.from("departments").select("id, name"),
    admin.from("companies").select("legal_name").eq("id", companyId).single(),
  ]);

  const legalName = (company?.legal_name as string) ?? null;

  const clientBlockIds = (clientBlocks ?? []).map((cb) => cb.id as string);
  const myClientApartadoIds = (clientApartados ?? [])
    .filter((ca) => clientBlockIds.includes(ca.client_block_id as string))
    .map((ca) => ca.id as string);
  const myApartadoCatalogIds = Array.from(
    new Set(
      (clientApartados ?? [])
        .filter((ca) => clientBlockIds.includes(ca.client_block_id as string))
        .map((ca) => ca.apartado_id as string)
    )
  );

  const [
    { data: files },
    { data: comments },
    { data: history },
    { data: supervisors },
    { data: templates },
  ] = await Promise.all([
    myClientApartadoIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .schema("documentation")
          .from("apartado_files")
          .select(
            "id, client_apartado_id, storage_path, file_name, file_size, mime_type, uploaded_by, uploaded_at, deleted_at"
          )
          .in("client_apartado_id", myClientApartadoIds)
          .is("deleted_at", null)
          .order("uploaded_at", { ascending: false }),
    myClientApartadoIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .schema("documentation")
          .from("apartado_comments")
          .select("id, client_apartado_id, author_id, body, created_at")
          .in("client_apartado_id", myClientApartadoIds)
          .order("created_at"),
    myClientApartadoIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .schema("documentation")
          .from("apartado_status_history")
          .select("id, client_apartado_id, from_status, to_status, changed_by, changed_at, reason")
          .in("client_apartado_id", myClientApartadoIds)
          .order("changed_at"),
    myClientApartadoIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .schema("documentation")
          .from("apartado_supervisors_v")
          .select("client_apartado_id, profile_id, assigned_at")
          .in("client_apartado_id", myClientApartadoIds),
    myApartadoCatalogIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .schema("documentation")
          .from("apartado_templates")
          .select("id, apartado_id, file_name, file_size, mime_type, uploaded_at, storage_path")
          .in("apartado_id", myApartadoCatalogIds)
          .order("uploaded_at"),
  ]);

  const deptNameMap = new Map<string, string>(
    (deptRows ?? []).map((d) => [d.id as string, d.name as string])
  );

  // Profiles a resolver: uploaders, autores, changed_by, supervisores
  const profileIds = new Set<string>();
  for (const s of supervisors ?? []) profileIds.add(s.profile_id as string);
  for (const f of files ?? []) {
    if (f.uploaded_by) profileIds.add(f.uploaded_by as string);
  }
  for (const c of comments ?? []) {
    if (c.author_id) profileIds.add(c.author_id as string);
  }
  for (const h of history ?? []) {
    if (h.changed_by) profileIds.add(h.changed_by as string);
  }

  const profileNameMap = new Map<string, { full_name: string | null; email: string }>();
  if (profileIds.size > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...profileIds]);
    for (const p of profiles ?? []) {
      profileNameMap.set(p.id as string, {
        full_name: (p.full_name as string | null) ?? null,
        email: p.email as string,
      });
    }
  }

  // Resolver dept de cada supervisor: usamos profile_roles
  const supervisorIds = Array.from(new Set((supervisors ?? []).map((s) => s.profile_id as string)));
  const profileDeptMap = new Map<string, { id: string; name: string }>();
  if (supervisorIds.length > 0) {
    const { data: roles } = await admin
      .from("profile_roles")
      .select("profile_id, scope_id, role:roles(name)")
      .in("profile_id", supervisorIds)
      .eq("scope_type", "department");
    for (const r of roles ?? []) {
      const role = r.role as unknown as { name: string } | null;
      if (!role) continue;
      if (role.name !== "Miembro de departamento" && role.name !== "Chief") continue;
      const pid = r.profile_id as string;
      if (!profileDeptMap.has(pid) && r.scope_id) {
        profileDeptMap.set(pid, {
          id: r.scope_id as string,
          name: deptNameMap.get(r.scope_id as string) ?? "",
        });
      }
    }
  }

  const supervisorsByApartado = new Map<string, ApartadoSupervisor[]>();
  for (const s of supervisors ?? []) {
    const pid = s.profile_id as string;
    const profile = profileNameMap.get(pid);
    const dept = profileDeptMap.get(pid);
    const list = supervisorsByApartado.get(s.client_apartado_id as string) ?? [];
    list.push({
      id: pid,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? "",
      department_id: dept?.id ?? null,
      department_name: dept?.name ?? null,
    });
    supervisorsByApartado.set(s.client_apartado_id as string, list);
  }

  const templatesByApartado = new Map<string, ApartadoTemplateFile[]>();
  for (const t of templates ?? []) {
    const aid = t.apartado_id as string;
    const list = templatesByApartado.get(aid) ?? [];
    list.push({
      id: t.id as string,
      apartado_id: aid,
      file_name: buildClientTemplateDownloadName(t.file_name as string, legalName),
      file_size: t.file_size as number,
      mime_type: t.mime_type as string,
      uploaded_at: t.uploaded_at as string,
      storage_path: t.storage_path as string,
    });
    templatesByApartado.set(aid, list);
  }

  const deptByApartado = new Map<string, string[]>();
  for (const link of deptLinks ?? []) {
    const list = deptByApartado.get(link.apartado_id as string) ?? [];
    list.push(link.department_id as string);
    deptByApartado.set(link.apartado_id as string, list);
  }

  const blockMap = new Map(
    (blocks ?? []).map((b) => [b.id as string, b as { id: string; name: string; slug: string; description: string | null; display_order: number }])
  );
  const apartadoMap = new Map(
    (apartados ?? []).map((a) => [
      a.id as string,
      a as { id: string; name: string; description: string | null; is_global: boolean },
    ])
  );

  type FileRow = {
    id: string; client_apartado_id: string; storage_path: string; file_name: string;
    file_size: number; mime_type: string; uploaded_by: string | null; uploaded_at: string;
    deleted_at: string | null;
  };
  type CommentRow = {
    id: string; client_apartado_id: string; author_id: string | null; body: string; created_at: string;
  };
  type HistoryRow = {
    id: string; client_apartado_id: string; from_status: ApartadoStatus | null;
    to_status: ApartadoStatus; changed_by: string | null; changed_at: string; reason: string | null;
  };

  const filesByApartado = new Map<string, FileRow[]>();
  for (const f of (files ?? []) as unknown as FileRow[]) {
    const list = filesByApartado.get(f.client_apartado_id) ?? [];
    list.push(f);
    filesByApartado.set(f.client_apartado_id, list);
  }
  const commentsByApartado = new Map<string, CommentRow[]>();
  for (const c of (comments ?? []) as unknown as CommentRow[]) {
    const list = commentsByApartado.get(c.client_apartado_id) ?? [];
    list.push(c);
    commentsByApartado.set(c.client_apartado_id, list);
  }
  const historyByApartado = new Map<string, HistoryRow[]>();
  for (const h of (history ?? []) as unknown as HistoryRow[]) {
    const list = historyByApartado.get(h.client_apartado_id) ?? [];
    list.push(h);
    historyByApartado.set(h.client_apartado_id, list);
  }

  const resultBlocks = (clientBlocks ?? [])
    .map((cb) => {
      const block = blockMap.get(cb.block_id as string);
      if (!block) return null;
      const apartadosOfBlock = (clientApartados ?? []).filter(
        (ca) => ca.client_block_id === cb.id
      );
      return {
        id: cb.id as string,
        company_id: cb.company_id as string,
        block_id: cb.block_id as string,
        name: block.name,
        slug: block.slug,
        description: block.description,
        // Orden del catálogo, no de client_blocks (que está siempre a 0).
        display_order: block.display_order,
        apartados: apartadosOfBlock
          .map((ca) => {
            const ap = apartadoMap.get(ca.apartado_id as string);
            if (!ap) return null;
            return {
              id: ca.id as string,
              client_block_id: ca.client_block_id as string,
              apartado_id: ca.apartado_id as string,
              name: ap.name,
              description: ap.description,
              display_order: ca.display_order as number,
              status: ca.status as ApartadoStatus,
              is_global: ap.is_global,
              is_optional: (ca.is_optional as boolean | null) ?? false,
              department_ids: deptByApartado.get(ca.apartado_id as string) ?? [],
              supervisors: supervisorsByApartado.get(ca.id as string) ?? [],
              templates: templatesByApartado.get(ca.apartado_id as string) ?? [],
              validated_at: (ca.validated_at as string | null) ?? null,
              validated_by: (ca.validated_by as string | null) ?? null,
              rejected_at: (ca.rejected_at as string | null) ?? null,
              rejected_by: (ca.rejected_by as string | null) ?? null,
              last_rejection_reason: (ca.last_rejection_reason as string | null) ?? null,
              files: (filesByApartado.get(ca.id as string) ?? []).map((f) => ({
                id: f.id,
                file_name: f.file_name,
                file_size: f.file_size,
                mime_type: f.mime_type,
                uploaded_by: f.uploaded_by,
                uploaded_by_name:
                  f.uploaded_by
                    ? profileNameMap.get(f.uploaded_by)?.full_name ??
                      profileNameMap.get(f.uploaded_by)?.email ??
                      null
                    : null,
                uploaded_at: f.uploaded_at,
                deleted_at: f.deleted_at,
                storage_path: f.storage_path,
              })),
              comments: (commentsByApartado.get(ca.id as string) ?? []).map((c) => ({
                id: c.id,
                author_id: c.author_id,
                author_name:
                  c.author_id
                    ? profileNameMap.get(c.author_id)?.full_name ??
                      profileNameMap.get(c.author_id)?.email ??
                      null
                    : null,
                body: c.body,
                created_at: c.created_at,
              })),
              history: (historyByApartado.get(ca.id as string) ?? []).map((h) => ({
                id: h.id,
                from_status: h.from_status,
                to_status: h.to_status,
                changed_by: h.changed_by,
                changed_by_name:
                  h.changed_by
                    ? profileNameMap.get(h.changed_by)?.full_name ??
                      profileNameMap.get(h.changed_by)?.email ??
                      null
                    : null,
                changed_at: h.changed_at,
                reason: h.reason,
              })),
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null)
          .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));

  // Apartados opcionales no cuentan para el progreso global.
  let total = 0;
  let validated = 0;
  for (const b of resultBlocks) {
    for (const a of b.apartados) {
      if (a.is_optional) continue;
      total++;
      if (a.status === "validado") validated++;
    }
  }

  return { blocks: resultBlocks, total_apartados: total, validated_apartados: validated };
}

// ────────────────────────────────────────────────────────────────────────────
// Catálogo asignable + miembros candidatos
// ────────────────────────────────────────────────────────────────────────────

export async function getAssignableCatalog(
  companyId: string
): Promise<{
  blocks: BlockTemplate[];
  allBlocks: BlockTemplate[];
  membersByDept: Record<string, DepartmentMember[]>;
  canRequest: boolean;
}> {
  await requireAdmin();
  const admin = createAdminClient();

  const canRequest = await hasPermission("request_client_documentation");

  const [
    { data: blocks },
    { data: apartados },
    { data: deptLinks },
    { data: assignedClientBlocks },
    { data: deptRows },
    { data: templates },
    { data: company },
  ] = await Promise.all([
    admin
      .schema("documentation")
      .from("blocks")
      .select("id, name, slug, description, display_order")
      .order("display_order"),
    admin
      .schema("documentation")
      .from("apartados")
      .select("id, block_id, name, description, display_order, is_global, email_template_slug")
      .order("display_order"),
    admin
      .schema("documentation")
      .from("apartado_departments")
      .select("apartado_id, department_id"),
    admin
      .schema("documentation")
      .from("client_blocks")
      .select("block_id")
      .eq("company_id", companyId),
    admin.from("departments").select("id, name"),
    admin
      .schema("documentation")
      .from("apartado_templates")
      .select("id, apartado_id, file_name, file_size, mime_type, uploaded_at, storage_path")
      .order("uploaded_at"),
    admin.from("companies").select("legal_name").eq("id", companyId).single(),
  ]);

  const legalName = (company?.legal_name as string) ?? null;

  const deptNameMap = new Map<string, string>(
    (deptRows ?? []).map((d) => [d.id as string, d.name as string])
  );

  const assignedBlockIds = new Set((assignedClientBlocks ?? []).map((cb) => cb.block_id as string));

  const apartadoDeptMap = new Map<string, string[]>();
  for (const link of deptLinks ?? []) {
    const list = apartadoDeptMap.get(link.apartado_id as string) ?? [];
    list.push(link.department_id as string);
    apartadoDeptMap.set(link.apartado_id as string, list);
  }

  const templatesByApartado = new Map<string, ApartadoTemplateFile[]>();
  for (const t of templates ?? []) {
    const aid = t.apartado_id as string;
    const list = templatesByApartado.get(aid) ?? [];
    list.push({
      id: t.id as string,
      apartado_id: aid,
      file_name: buildClientTemplateDownloadName(t.file_name as string, legalName),
      file_size: t.file_size as number,
      mime_type: t.mime_type as string,
      uploaded_at: t.uploaded_at as string,
      storage_path: t.storage_path as string,
    });
    templatesByApartado.set(aid, list);
  }

  const apartadosByBlock = new Map<string, ReturnType<typeof toApartadoTemplate>[]>();
  for (const a of apartados ?? []) {
    const ap = toApartadoTemplate(a, apartadoDeptMap, templatesByApartado);
    if (!canRequest) continue;
    const list = apartadosByBlock.get(ap.block_id) ?? [];
    list.push(ap);
    apartadosByBlock.set(ap.block_id, list);
  }

  const allBlocks: BlockTemplate[] = (blocks ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    slug: b.slug as string,
    description: (b.description as string | null) ?? null,
    display_order: b.display_order as number,
    apartados: apartadosByBlock.get(b.id as string) ?? [],
  }));

  const result: BlockTemplate[] = allBlocks
    .filter((b) => !assignedBlockIds.has(b.id))
    .filter((b) => b.apartados.length > 0);

  const interestingDepts = new Set<string>();
  for (const b of allBlocks) {
    for (const a of b.apartados) {
      if (!a.is_global) {
        for (const d of a.department_ids) interestingDepts.add(d);
      }
    }
  }
  const membersByDept: Record<string, DepartmentMember[]> = {};
  if (interestingDepts.size > 0 || allBlocks.some((b) => b.apartados.some((a) => a.is_global))) {
    const needsAll = allBlocks.some((b) => b.apartados.some((a) => a.is_global));
    let query = admin
      .from("profile_roles")
      .select("scope_id, profile_id, role:roles(name), profile:profiles(id, full_name, email)")
      .eq("scope_type", "department");
    if (!needsAll) query = query.in("scope_id", [...interestingDepts]);
    const { data: roles } = await query;
    const seen = new Set<string>();
    for (const link of roles ?? []) {
      const role = link.role as unknown as { name: string } | null;
      if (!role) continue;
      if (role.name !== "Miembro de departamento" && role.name !== "Chief") continue;
      const profile = link.profile as unknown as {
        id: string;
        full_name: string | null;
        email: string;
      } | null;
      if (!profile || !link.scope_id) continue;
      const key = `${link.scope_id}|${profile.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const deptId = link.scope_id as string;
      if (!membersByDept[deptId]) membersByDept[deptId] = [];
      membersByDept[deptId].push({
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        department_id: deptId,
        department_name: deptNameMap.get(deptId) ?? deptId,
      });
    }
  }

  return { blocks: result, allBlocks, membersByDept, canRequest };
}

function toApartadoTemplate(
  raw: Record<string, unknown>,
  deptMap: Map<string, string[]>,
  templatesMap: Map<string, ApartadoTemplateFile[]>
) {
  const id = raw.id as string;
  return {
    id,
    block_id: raw.block_id as string,
    name: raw.name as string,
    description: (raw.description as string | null) ?? null,
    display_order: raw.display_order as number,
    is_global: raw.is_global as boolean,
    department_ids: deptMap.get(id) ?? [],
    templates: templatesMap.get(id) ?? [],
    email_template_slug: (raw.email_template_slug as string | null) ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Mutaciones — añadir / quitar apartados/bloques
// ────────────────────────────────────────────────────────────────────────────

export async function addBlockToClient(input: {
  companyId: string;
  blockId: string;
  apartados: { apartadoId: string; supervisorIds: string[]; isOptional?: boolean }[];
}): Promise<void> {
  await requireAdmin();
  await requireRequestPermission();
  const { user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  // Validar supervisores propuestos: deben pertenecer a algún depto del apartado
  const metaById = new Map<string, { is_global: boolean; department_ids: string[] }>();
  for (const a of input.apartados) {
    const meta = await getApartadoMeta(a.apartadoId);
    metaById.set(a.apartadoId, meta);
    for (const sid of a.supervisorIds) {
      await ensureProfileInApartadoDept(sid, meta);
    }
  }

  const admin = createAdminClient();

  const { data: cb, error: cbError } = await admin
    .schema("documentation")
    .from("client_blocks")
    .insert({
      company_id: input.companyId,
      block_id: input.blockId,
      added_by: user.id,
    })
    .select("id")
    .single();
  if (cbError) throw new Error(cbError.message);

  if (input.apartados.length > 0) {
    const { data: cas, error: caError } = await admin
      .schema("documentation")
      .from("client_apartados")
      .insert(
        input.apartados.map((a, idx) => ({
          client_block_id: cb!.id,
          apartado_id: a.apartadoId,
          added_by: user.id,
          display_order: idx,
          is_optional: a.isOptional ?? false,
        }))
      )
      .select("id, apartado_id");
    if (caError) throw new Error(caError.message);

    const supRows: { profile_id: string; role_id: string; scope_type: string; scope_id: string }[] = [];
    const supervisorRoleId = await getSupervisorRoleId();
    for (const ca of cas ?? []) {
      const match = input.apartados.find((a) => a.apartadoId === (ca.apartado_id as string));
      if (!match) continue;
      for (const sid of match.supervisorIds) {
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
      if (supErr) throw new Error(supErr.message);
    }
  }
  revalidatePath(`/admin/clientes/${input.companyId}`);
}

let cachedSupervisorRoleId: string | null = null;
async function getSupervisorRoleId(): Promise<string> {
  if (cachedSupervisorRoleId) return cachedSupervisorRoleId;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("roles")
    .select("id")
    .eq("name", "Supervisor de apartado")
    .single();
  if (error || !data) throw new Error("Rol 'Supervisor de apartado' no encontrado");
  cachedSupervisorRoleId = data.id as string;
  return cachedSupervisorRoleId;
}

export async function addApartadoToClient(input: {
  companyId: string;
  clientBlockId: string;
  apartadoId: string;
  supervisorIds: string[];
  isOptional?: boolean;
}): Promise<void> {
  await requireAdmin();
  await requireRequestPermission();
  const { user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  const meta = await getApartadoMeta(input.apartadoId);
  for (const sid of input.supervisorIds) {
    await ensureProfileInApartadoDept(sid, meta);
  }

  const admin = createAdminClient();
  const { data: ca, error } = await admin
    .schema("documentation")
    .from("client_apartados")
    .insert({
      client_block_id: input.clientBlockId,
      apartado_id: input.apartadoId,
      added_by: user.id,
      is_optional: input.isOptional ?? false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (input.supervisorIds.length > 0) {
    const supervisorRoleId = await getSupervisorRoleId();
    const { error: supErr } = await admin.from("profile_roles").insert(
      input.supervisorIds.map((sid) => ({
        profile_id: sid,
        role_id: supervisorRoleId,
        scope_type: "client_apartado" as const,
        scope_id: ca!.id as string,
      }))
    );
    if (supErr) throw new Error(supErr.message);
  }
  revalidatePath(`/admin/clientes/${input.companyId}`);
}

export async function setApartadoOptional(input: {
  companyId: string;
  clientApartadoId: string;
  isOptional: boolean;
}): Promise<void> {
  await requireAdmin();
  await requireRequestPermission();
  const admin = createAdminClient();
  const { error } = await admin
    .schema("documentation")
    .from("client_apartados")
    .update({ is_optional: input.isOptional })
    .eq("id", input.clientApartadoId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/clientes/${input.companyId}`);
}

export async function removeApartadoFromClient(
  companyId: string,
  clientApartadoId: string
): Promise<void> {
  await requireAdmin();
  await requireRequestPermission();
  const admin = createAdminClient();

  // Limpia primero los grants de supervisor (profile_roles con scope=client_apartado)
  await admin
    .from("profile_roles")
    .delete()
    .eq("scope_type", "client_apartado")
    .eq("scope_id", clientApartadoId);

  const { error } = await admin
    .schema("documentation")
    .from("client_apartados")
    .delete()
    .eq("id", clientApartadoId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/clientes/${companyId}`);
}

export async function removeBlockFromClient(
  companyId: string,
  clientBlockId: string
): Promise<void> {
  await requireAdmin();
  await requireRequestPermission();
  const admin = createAdminClient();

  // Recoger ids de client_apartados del bloque para limpiar grants
  const { data: cas } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("id")
    .eq("client_block_id", clientBlockId);
  const ids = (cas ?? []).map((c) => c.id as string);
  if (ids.length > 0) {
    await admin
      .from("profile_roles")
      .delete()
      .eq("scope_type", "client_apartado")
      .in("scope_id", ids);
  }

  const { error } = await admin
    .schema("documentation")
    .from("client_blocks")
    .delete()
    .eq("id", clientBlockId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/clientes/${companyId}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Supervisores N:M
// ────────────────────────────────────────────────────────────────────────────

async function authorizeSupervisorChange(clientApartadoId: string): Promise<{
  apartadoId: string;
  meta: { is_global: boolean; department_ids: string[] };
}> {
  await requireRequestPermission();
  const admin = createAdminClient();
  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("apartado_id")
    .eq("id", clientApartadoId)
    .single();
  if (!ca) throw new Error("Apartado no encontrado");
  const apartadoId = ca.apartado_id as string;
  const meta = await getApartadoMeta(apartadoId);
  return { apartadoId, meta };
}

export async function addSupervisor(input: {
  companyId: string;
  clientApartadoId: string;
  profileId: string;
}): Promise<void> {
  await requireAdmin();
  const { meta } = await authorizeSupervisorChange(input.clientApartadoId);
  await ensureProfileInApartadoDept(input.profileId, meta);

  const admin = createAdminClient();
  const supervisorRoleId = await getSupervisorRoleId();
  const { error } = await admin
    .from("profile_roles")
    .upsert(
      {
        profile_id: input.profileId,
        role_id: supervisorRoleId,
        scope_type: "client_apartado",
        scope_id: input.clientApartadoId,
      },
      {
        onConflict: "profile_id,role_id,scope_type,scope_id",
        ignoreDuplicates: true,
      }
    );
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/clientes/${input.companyId}`);
}

export async function removeSupervisor(input: {
  companyId: string;
  clientApartadoId: string;
  profileId: string;
}): Promise<void> {
  await requireAdmin();
  await authorizeSupervisorChange(input.clientApartadoId);

  const admin = createAdminClient();
  const supervisorRoleId = await getSupervisorRoleId();
  const { error } = await admin
    .from("profile_roles")
    .delete()
    .eq("profile_id", input.profileId)
    .eq("role_id", supervisorRoleId)
    .eq("scope_type", "client_apartado")
    .eq("scope_id", input.clientApartadoId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/clientes/${input.companyId}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Validar / rechazar
// ────────────────────────────────────────────────────────────────────────────

async function authorizeValidation(clientApartadoId: string): Promise<{
  userId: string;
  apartadoId: string;
}> {
  const { user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  const admin = createAdminClient();
  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("apartado_id")
    .eq("id", clientApartadoId)
    .single();
  if (!ca) throw new Error("Apartado no encontrado");

  // Chief / global
  if (await hasPermission("validate_documentation")) {
    return { userId: user.id, apartadoId: ca.apartado_id as string };
  }
  // Supervisor del apartado (vía rol "Supervisor de apartado" con scope client_apartado)
  if (
    await hasPermission("validate_client_documentation", {
      type: "client_apartado",
      id: clientApartadoId,
    })
  ) {
    return { userId: user.id, apartadoId: ca.apartado_id as string };
  }
  throw new Error("Sin permisos para validar/rechazar este apartado");
}

export async function validateApartado(
  companyId: string,
  clientApartadoId: string
): Promise<void> {
  await requireAdmin();
  const { userId } = await authorizeValidation(clientApartadoId);
  const admin = createAdminClient();
  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("status")
    .eq("id", clientApartadoId)
    .single();
  const fromStatus = (ca?.status as ApartadoStatus | undefined) ?? null;

  const { error } = await admin
    .schema("documentation")
    .from("client_apartados")
    .update({
      status: "validado",
      validated_at: new Date().toISOString(),
      validated_by: userId,
      rejected_at: null,
      rejected_by: null,
      last_rejection_reason: null,
    })
    .eq("id", clientApartadoId);
  if (error) throw new Error(error.message);
  await logStatusChange(clientApartadoId, fromStatus, "validado", userId);

  const labels = await getActorAndApartadoLabel(userId, clientApartadoId);
  await notifyDocumentationClients({
    clientApartadoId,
    actorId: userId,
    summary: buildSummary(labels.actorName, labels.actorEmail, "ha validado", labels.apartadoName),
  });

  revalidatePath(`/admin/clientes/${companyId}`);
}

export async function rejectApartado(input: {
  companyId: string;
  clientApartadoId: string;
  reason: string;
}): Promise<void> {
  await requireAdmin();
  if (!input.reason.trim()) throw new Error("Indica un motivo de rechazo");
  const { userId } = await authorizeValidation(input.clientApartadoId);
  const admin = createAdminClient();
  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("status")
    .eq("id", input.clientApartadoId)
    .single();
  const fromStatus = (ca?.status as ApartadoStatus | undefined) ?? null;

  const { error } = await admin
    .schema("documentation")
    .from("client_apartados")
    .update({
      status: "rechazado",
      rejected_at: new Date().toISOString(),
      rejected_by: userId,
      last_rejection_reason: input.reason.trim(),
      validated_at: null,
      validated_by: null,
    })
    .eq("id", input.clientApartadoId);
  if (error) throw new Error(error.message);
  await logStatusChange(input.clientApartadoId, fromStatus, "rechazado", userId, input.reason.trim());

  const labels = await getActorAndApartadoLabel(userId, input.clientApartadoId);
  await notifyDocumentationClients({
    clientApartadoId: input.clientApartadoId,
    actorId: userId,
    summary: buildSummary(labels.actorName, labels.actorEmail, "ha rechazado", labels.apartadoName),
  });

  revalidatePath(`/admin/clientes/${input.companyId}`);
}

/**
 * Revierte un apartado en estado `validado` o `rechazado` y lo deja en
 * `pendiente`. Limpia los campos `validated_*` / `rejected_*` y deja huella
 * en el historial. Los archivos no se tocan.
 */
export async function reopenApartado(
  companyId: string,
  clientApartadoId: string
): Promise<void> {
  await requireAdmin();
  const { userId } = await authorizeValidation(clientApartadoId);
  const admin = createAdminClient();

  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("status")
    .eq("id", clientApartadoId)
    .single();
  if (!ca) throw new Error("Apartado no encontrado");
  const fromStatus = ca.status as ApartadoStatus;
  if (fromStatus !== "validado" && fromStatus !== "rechazado") {
    throw new Error("Solo se puede reabrir un apartado validado o rechazado");
  }

  const { error } = await admin
    .schema("documentation")
    .from("client_apartados")
    .update({
      status: "pendiente",
      validated_at: null,
      validated_by: null,
      rejected_at: null,
      rejected_by: null,
      last_rejection_reason: null,
    })
    .eq("id", clientApartadoId);
  if (error) throw new Error(error.message);
  await logStatusChange(clientApartadoId, fromStatus, "pendiente", userId, "__event:reopened__");
  revalidatePath(`/admin/clientes/${companyId}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Comentarios admin
// ────────────────────────────────────────────────────────────────────────────

export async function addAdminComment(
  companyId: string,
  clientApartadoId: string,
  body: string
): Promise<void> {
  await requireAdmin();
  if (!body.trim()) throw new Error("Comentario vacío");
  // Mismo gate que validar/rechazar: chief global o supervisor del apartado.
  const { userId } = await authorizeValidation(clientApartadoId);
  void userId;
  const { user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  const admin = createAdminClient();
  const { error } = await admin
    .schema("documentation")
    .from("apartado_comments")
    .insert({
      client_apartado_id: clientApartadoId,
      author_id: user.id,
      body: body.trim(),
    });
  if (error) throw new Error(error.message);

  const labels = await getActorAndApartadoLabel(user.id, clientApartadoId);
  await notifyDocumentationClients({
    clientApartadoId,
    actorId: user.id,
    summary: buildSummary(labels.actorName, labels.actorEmail, "ha comentado", labels.apartadoName),
  });

  revalidatePath(`/admin/clientes/${companyId}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Subida (admin) — útil cuando un técnico sube en nombre del cliente
// ────────────────────────────────────────────────────────────────────────────

export async function adminUploadApartadoFile(input: {
  companyId: string;
  clientApartadoId: string;
  fileName: string;
  fileBase64: string;
  mimeType: string;
}): Promise<void> {
  await requireAdmin();
  const { user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");
  const admin = createAdminClient();

  // Chief global o supervisor del apartado pueden adjuntar archivos.
  await authorizeValidation(input.clientApartadoId);
  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("client_block_id, status, apartado_id")
    .eq("id", input.clientApartadoId)
    .single();
  if (!ca) throw new Error("Apartado no encontrado");
  if ((ca.status as string) === "validado") {
    throw new Error("No se pueden adjuntar archivos a un apartado validado");
  }

  const { data: cb } = await admin
    .schema("documentation")
    .from("client_blocks")
    .select("company_id")
    .eq("id", ca.client_block_id as string)
    .single();
  if (!cb) throw new Error("Bloque no encontrado");

  const fileId = crypto.randomUUID();
  const storagePath = buildDocumentationStoragePath({
    companyId: cb.company_id as string,
    clientApartadoId: input.clientApartadoId,
    fileId,
    fileName: input.fileName,
  });
  const buffer = Buffer.from(input.fileBase64, "base64");
  const { error: uploadError } = await admin.storage
    .from(DOCUMENTATION_BUCKET)
    .upload(storagePath, buffer, { contentType: input.mimeType });
  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await admin
    .schema("documentation")
    .from("apartado_files")
    .insert({
      id: fileId,
      client_apartado_id: input.clientApartadoId,
      storage_path: storagePath,
      file_name: input.fileName,
      file_size: buffer.byteLength,
      mime_type: input.mimeType,
      uploaded_by: user.id,
    });
  if (insertError) throw new Error(insertError.message);

  const currentStatus = ca.status as ApartadoStatus;
  await admin.schema("documentation").from("apartado_status_history").insert({
    client_apartado_id: input.clientApartadoId,
    from_status: currentStatus,
    to_status: currentStatus,
    changed_by: user.id,
    reason: "__event:file_uploaded__",
  });

  const labels = await getActorAndApartadoLabel(user.id, input.clientApartadoId);
  await notifyDocumentationClients({
    clientApartadoId: input.clientApartadoId,
    actorId: user.id,
    summary: buildSummary(
      labels.actorName,
      labels.actorEmail,
      "ha subido un archivo",
      labels.apartadoName
    ),
  });

  revalidatePath(`/admin/clientes/${input.companyId}`);
}

export async function adminSoftDeleteApartadoFile(fileId: string): Promise<void> {
  await requireAdmin();
  const { user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");
  const admin = createAdminClient();

  const { data: file } = await admin
    .schema("documentation")
    .from("apartado_files")
    .select("id, client_apartado_id, deleted_at")
    .eq("id", fileId)
    .single();
  if (!file) throw new Error("Archivo no encontrado");
  if (file.deleted_at) throw new Error("Archivo ya eliminado");

  const clientApartadoId = file.client_apartado_id as string;
  // Chief global o supervisor del apartado pueden eliminar archivos.
  await authorizeValidation(clientApartadoId);
  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("apartado_id, client_block_id, status")
    .eq("id", clientApartadoId)
    .single();
  if (!ca) throw new Error("Apartado no encontrado");
  const currentStatus = ca.status as ApartadoStatus;
  if (currentStatus === "validado") {
    throw new Error("No se pueden eliminar archivos de un apartado validado");
  }

  const { data: cb } = await admin
    .schema("documentation")
    .from("client_blocks")
    .select("company_id")
    .eq("id", ca.client_block_id as string)
    .single();

  const { error } = await admin
    .schema("documentation")
    .from("apartado_files")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", fileId);
  if (error) throw new Error(error.message);

  await maybeResetToPendiente(clientApartadoId, currentStatus, user.id);

  if (cb?.company_id) {
    revalidatePath(`/admin/clientes/${cb.company_id as string}`);
  }
}

/** Si tras un borrado no quedan archivos vivos y el status no es ya `pendiente` ni `validado`, lo lleva a `pendiente`. */
async function maybeResetToPendiente(
  clientApartadoId: string,
  currentStatus: ApartadoStatus,
  userId: string
): Promise<void> {
  if (currentStatus === "pendiente" || currentStatus === "validado") return;
  const admin = createAdminClient();
  const { count } = await admin
    .schema("documentation")
    .from("apartado_files")
    .select("id", { count: "exact", head: true })
    .eq("client_apartado_id", clientApartadoId)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) return;
  const { error } = await admin
    .schema("documentation")
    .from("client_apartados")
    .update({
      status: "pendiente",
      validated_at: null,
      validated_by: null,
      rejected_at: null,
      rejected_by: null,
      last_rejection_reason: null,
    })
    .eq("id", clientApartadoId);
  if (error) throw new Error(error.message);
  await logStatusChange(clientApartadoId, currentStatus, "pendiente", userId, "__event:no_files_left__");
}

// ────────────────────────────────────────────────────────────────────────────
// Descargas
// ────────────────────────────────────────────────────────────────────────────

export async function getApartadoFileSignedUrl(fileId: string): Promise<string> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: file } = await admin
    .schema("documentation")
    .from("apartado_files")
    .select("storage_path, file_name")
    .eq("id", fileId)
    .single();
  if (!file) throw new Error("Archivo no encontrado");
  return getDocumentationSignedUrl(
    admin,
    file.storage_path as string,
    (file.file_name as string) ?? undefined
  );
}

export async function getApartadoTemplateSignedUrl(templateId: string): Promise<string> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: t } = await admin
    .schema("documentation")
    .from("apartado_templates")
    .select("storage_path, file_name")
    .eq("id", templateId)
    .single();
  if (!t) throw new Error("Plantilla no encontrada");
  return getDocumentationSignedUrl(
    admin,
    t.storage_path as string,
    (t.file_name as string) ?? undefined
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Recordar al cliente — manda email con detalle de rechazados/pendientes
// ────────────────────────────────────────────────────────────────────────────

const REMINDER_THROTTLE_HOURS = 6;

/**
 * Manda un email al cliente recordándole los apartados rechazados y pendientes.
 * Permitido a chiefs (validate_documentation global) o a supervisores que
 * tengan al menos un apartado de esta empresa. Throttled a 1 cada 6h por empresa.
 */
export async function remindClientDocumentation(companyId: string): Promise<void> {
  await requireAdmin();
  const { user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  // 1. Permiso
  const isGlobal = await hasPermission("validate_documentation");
  if (!isGlobal) {
    const supervisedIds = await userScopeIds("validate_client_documentation", "client_apartado");
    if (supervisedIds.length === 0) {
      throw new Error("Sin permisos para recordar a este cliente");
    }
    const admin = createAdminClient();
    const { data: matches } = await admin
      .schema("documentation")
      .from("client_apartados")
      .select("id, client_block:client_blocks!inner(company_id)")
      .in("id", supervisedIds);
    const belongs = (matches ?? []).some((m) => {
      const cb = m.client_block as unknown as { company_id: string } | null;
      return cb?.company_id === companyId;
    });
    if (!belongs) throw new Error("Sin permisos para recordar a este cliente");
  }

  const admin = createAdminClient();

  // 2. Throttle
  const since = new Date(
    Date.now() - REMINDER_THROTTLE_HOURS * 60 * 60 * 1000
  ).toISOString();
  const { data: recent } = await admin
    .schema("documentation")
    .from("client_reminder_log")
    .select("sent_at")
    .eq("company_id", companyId)
    .gt("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    const next = new Date(
      new Date(recent.sent_at as string).getTime() +
        REMINDER_THROTTLE_HOURS * 60 * 60 * 1000
    );
    const hh = next.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    throw new Error(
      `Ya se envió un recordatorio recientemente. Vuelve a intentarlo a partir de las ${hh}.`
    );
  }

  // 3. Invocar edge function — solo si responde 2xx grabamos el throttle
  const { data, error: invokeErr } = await admin.functions.invoke(
    "notify-documentation-client-reminder",
    { body: { company_id: companyId, sent_by_id: user.id } }
  );
  if (invokeErr) {
    const detail = (data && typeof data === "object" && "error" in data)
      ? String((data as { error: unknown }).error)
      : invokeErr.message;
    throw new Error(`No se pudo enviar el email: ${detail}`);
  }

  // 4. Log (throttle) — después del envío exitoso
  const { error: logErr } = await admin
    .schema("documentation")
    .from("client_reminder_log")
    .insert({ company_id: companyId, sent_by: user.id });
  if (logErr) throw new Error(logErr.message);
}
