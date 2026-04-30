"use server";

import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/require-client";
import { createAdminClient } from "@/lib/supabase/server";
import {
  DOCUMENTATION_BUCKET,
  buildClientTemplateDownloadName,
  buildDocumentationStoragePath,
  getDocumentationSignedUrl,
} from "@/lib/storage/documentation";
import type {
  ApartadoStatus,
  ApartadoSupervisor,
  ApartadoTemplateFile,
  ClientDocumentation,
} from "@/lib/types/documentation";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export async function getMyDocumentation(): Promise<ClientDocumentation> {
  const { companyId } = await requireClient();
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
      .select("id, company_id, block_id, display_order")
      .eq("company_id", companyId),
    admin
      .schema("documentation")
      .from("client_apartados")
      .select(
        "id, client_block_id, apartado_id, status, display_order, validated_at, rejected_at, last_rejection_reason"
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

  const blockIds = new Set((clientBlocks ?? []).map((cb) => cb.id as string));
  const myApartados = (clientApartados ?? []).filter((ca) =>
    blockIds.has(ca.client_block_id as string)
  );
  const apartadoIds = myApartados.map((ca) => ca.id as string);
  const apartadoCatalogIds = Array.from(new Set(myApartados.map((ca) => ca.apartado_id as string)));

  const [
    { data: files },
    { data: comments },
    { data: history },
    { data: supervisors },
    { data: templates },
  ] = await Promise.all([
    apartadoIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .schema("documentation")
          .from("apartado_files")
          .select(
            "id, client_apartado_id, storage_path, file_name, file_size, mime_type, uploaded_by, uploaded_at, deleted_at"
          )
          .in("client_apartado_id", apartadoIds)
          .is("deleted_at", null)
          .order("uploaded_at", { ascending: false }),
    apartadoIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .schema("documentation")
          .from("apartado_comments")
          .select("id, client_apartado_id, author_id, body, created_at")
          .in("client_apartado_id", apartadoIds)
          .order("created_at"),
    apartadoIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .schema("documentation")
          .from("apartado_status_history")
          .select("id, client_apartado_id, from_status, to_status, changed_by, changed_at, reason")
          .in("client_apartado_id", apartadoIds)
          .order("changed_at"),
    apartadoIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .schema("documentation")
          .from("apartado_supervisors_v")
          .select("client_apartado_id, profile_id")
          .in("client_apartado_id", apartadoIds),
    apartadoCatalogIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .schema("documentation")
          .from("apartado_templates")
          .select("id, apartado_id, file_name, file_size, mime_type, uploaded_at, storage_path")
          .in("apartado_id", apartadoCatalogIds)
          .order("uploaded_at"),
  ]);

  const deptNameMap = new Map<string, string>(
    (deptRows ?? []).map((d) => [d.id as string, d.name as string])
  );

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

  // Dept de cada supervisor
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
  const blockMap = new Map((blocks ?? []).map((b) => [b.id as string, b]));
  const apartadoMap = new Map((apartados ?? []).map((a) => [a.id as string, a]));

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
      const apartadosOfBlock = myApartados.filter((ca) => ca.client_block_id === cb.id);
      return {
        id: cb.id as string,
        company_id: cb.company_id as string,
        block_id: cb.block_id as string,
        name: block.name as string,
        slug: block.slug as string,
        description: (block.description as string | null) ?? null,
        display_order: cb.display_order as number,
        apartados: apartadosOfBlock
          .map((ca) => {
            const ap = apartadoMap.get(ca.apartado_id as string);
            if (!ap) return null;
            return {
              id: ca.id as string,
              client_block_id: ca.client_block_id as string,
              apartado_id: ca.apartado_id as string,
              name: ap.name as string,
              description: (ap.description as string | null) ?? null,
              display_order: ca.display_order as number,
              status: ca.status as ApartadoStatus,
              is_global: ap.is_global as boolean,
              department_ids: deptByApartado.get(ca.apartado_id as string) ?? [],
              supervisors: supervisorsByApartado.get(ca.id as string) ?? [],
              templates: templatesByApartado.get(ca.apartado_id as string) ?? [],
              validated_at: (ca.validated_at as string | null) ?? null,
              validated_by: null,
              rejected_at: (ca.rejected_at as string | null) ?? null,
              rejected_by: null,
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

  let total = 0;
  let validated = 0;
  for (const b of resultBlocks) {
    for (const a of b.apartados) {
      total++;
      if (a.status === "validado") validated++;
    }
  }

  return { blocks: resultBlocks, total_apartados: total, validated_apartados: validated };
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

async function ensureClientOwnsApartado(
  clientApartadoId: string
): Promise<{ companyId: string; status: ApartadoStatus }> {
  const { user, companyId } = await requireClient();
  const admin = createAdminClient();
  const { data: ca } = await admin
    .schema("documentation")
    .from("client_apartados")
    .select("client_block_id, status")
    .eq("id", clientApartadoId)
    .single();
  if (!ca) throw new Error("Apartado no encontrado");

  const { data: cb } = await admin
    .schema("documentation")
    .from("client_blocks")
    .select("company_id")
    .eq("id", ca.client_block_id as string)
    .single();
  if (!cb || (cb.company_id as string) !== companyId) {
    throw new Error("Apartado no pertenece a tu empresa");
  }
  void user;
  return { companyId, status: ca.status as ApartadoStatus };
}

export async function uploadApartadoFile(input: {
  clientApartadoId: string;
  fileName: string;
  fileBase64: string;
  mimeType: string;
}): Promise<void> {
  const { user, companyId } = await requireClient();
  const { status } = await ensureClientOwnsApartado(input.clientApartadoId);
  if (status === "validado") {
    throw new Error("No se pueden adjuntar archivos a un apartado validado");
  }

  const admin = createAdminClient();
  const buffer = Buffer.from(input.fileBase64, "base64");
  if (buffer.byteLength === 0) throw new Error("Archivo vacío");
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error("El archivo supera el tamaño máximo (25 MB)");
  }

  const fileId = crypto.randomUUID();
  const storagePath = buildDocumentationStoragePath({
    companyId,
    clientApartadoId: input.clientApartadoId,
    fileId,
    fileName: input.fileName,
  });

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

  if (status === "pendiente" || status === "rechazado") {
    await admin
      .schema("documentation")
      .from("client_apartados")
      .update({ status: "enviado" })
      .eq("id", input.clientApartadoId);
    await logStatusChange(input.clientApartadoId, status, "enviado", user.id);
  }

  revalidatePath("/app/empresa");
}

export async function softDeleteApartadoFile(fileId: string): Promise<void> {
  const { user } = await requireClient();
  const admin = createAdminClient();

  const { data: file } = await admin
    .schema("documentation")
    .from("apartado_files")
    .select("client_apartado_id, uploaded_by, deleted_at")
    .eq("id", fileId)
    .single();
  if (!file) throw new Error("Archivo no encontrado");
  if (file.deleted_at) throw new Error("Archivo ya eliminado");

  const clientApartadoId = file.client_apartado_id as string;
  const { status } = await ensureClientOwnsApartado(clientApartadoId);
  if (status === "validado") {
    throw new Error("No se pueden eliminar archivos de un apartado validado");
  }

  const { error } = await admin
    .schema("documentation")
    .from("apartado_files")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", fileId);
  if (error) throw new Error(error.message);

  await maybeResetToPendiente(clientApartadoId, status, user.id);
  revalidatePath("/app/empresa");
}

/** Si tras una operación no quedan archivos vivos y el status no es ya `pendiente` ni `validado`, lo lleva a `pendiente`. */
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

export async function addClientComment(
  clientApartadoId: string,
  body: string
): Promise<void> {
  if (!body.trim()) throw new Error("Comentario vacío");
  const { user } = await requireClient();
  await ensureClientOwnsApartado(clientApartadoId);

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
  revalidatePath("/app/empresa");
}

export async function getApartadoFileSignedUrlForClient(fileId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: file } = await admin
    .schema("documentation")
    .from("apartado_files")
    .select("storage_path, file_name, client_apartado_id")
    .eq("id", fileId)
    .single();
  if (!file) throw new Error("Archivo no encontrado");
  await ensureClientOwnsApartado(file.client_apartado_id as string);
  return getDocumentationSignedUrl(
    admin,
    file.storage_path as string,
    (file.file_name as string) ?? undefined
  );
}

export async function getApartadoTemplateSignedUrlForClient(templateId: string): Promise<string> {
  const { companyId } = await requireClient();
  const admin = createAdminClient();
  const [{ data: t }, { data: company }] = await Promise.all([
    admin
      .schema("documentation")
      .from("apartado_templates")
      .select("storage_path, file_name")
      .eq("id", templateId)
      .single(),
    admin
      .from("companies")
      .select("legal_name")
      .eq("id", companyId)
      .single(),
  ]);
  if (!t) throw new Error("Plantilla no encontrada");
  const downloadName = buildClientTemplateDownloadName(
    t.file_name as string,
    (company?.legal_name as string) ?? null
  );
  return getDocumentationSignedUrl(admin, t.storage_path as string, downloadName);
}
