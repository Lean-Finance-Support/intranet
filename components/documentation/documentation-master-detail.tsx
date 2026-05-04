"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ApartadoComment,
  ApartadoStatus,
  ApartadoStatusHistoryEntry,
  ClientApartado,
  ClientDocumentation,
  DepartmentMember,
} from "@/lib/types/documentation";
import { statusDotColor } from "./status-badge";
import BlockList from "./block-list";
import ApartadoDetail from "./apartado-detail";
import ConfirmDialog from "@/components/confirm-dialog";

export interface DocumentationActionHandlers {
  uploadFile: (clientApartadoId: string, file: File) => Promise<void>;
  downloadFile: (fileId: string) => Promise<string>;
  downloadTemplate: (templateId: string) => Promise<string>;
  deleteFile?: (fileId: string) => Promise<void>;
  addComment: (clientApartadoId: string, body: string) => Promise<void>;
  validate?: (clientApartadoId: string) => Promise<void>;
  reject?: (clientApartadoId: string, reason: string) => Promise<void>;
  reopen?: (clientApartadoId: string) => Promise<void>;
  addSupervisor?: (clientApartadoId: string, profileId: string) => Promise<void>;
  removeSupervisor?: (clientApartadoId: string, profileId: string) => Promise<void>;
  removeApartado?: (clientApartadoId: string) => Promise<void>;
  removeBlock?: (clientBlockId: string) => Promise<void>;
  toggleOptional?: (clientApartadoId: string, isOptional: boolean) => Promise<void>;
}

interface Props {
  data: ClientDocumentation;
  mode: "client" | "admin";
  currentUserId: string;
  currentUserName?: string | null;
  handlers: DocumentationActionHandlers;
  membersByDept?: Record<string, DepartmentMember[]>;
  canManage?: boolean;
  resolveCanValidate?: (apartado: ClientApartado) => boolean;
  onAddBlock?: () => void;
  onAddApartado?: (clientBlockId: string, catalogBlockId: string) => void;
  onRemindClient?: (comment?: string) => Promise<void>;
}

type GhostMap = Map<string, ApartadoComment[]>;

// Devuelve un texto corto y compacto en español ("hace 2 min", "hace 3 h",
// "hace 5 d"). No usa Intl.RelativeTimeFormat porque queremos abreviaturas y
// no negociar plurales/preposiciones de la API nativa.
function formatRelativeShortEs(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "hace unos segundos";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `hace ${diffD} d`;
  const diffMo = Math.round(diffD / 30);
  if (diffMo < 12) return `hace ${diffMo} mes${diffMo === 1 ? "" : "es"}`;
  const diffY = Math.round(diffMo / 12);
  return `hace ${diffY} año${diffY === 1 ? "" : "s"}`;
}

export default function DocumentationMasterDetail({
  data,
  mode,
  currentUserId,
  currentUserName,
  handlers,
  membersByDept,
  canManage,
  resolveCanValidate,
  onAddBlock,
  onAddApartado,
  onRemindClient,
}: Props) {
  const isAdmin = mode === "admin";

  // ─── Estado optimista ───────────────────────────────────────────────
  // optimisticDoc: copia mutable que se actualiza al instante en cada acción.
  // Se sincroniza con `data` (la verdad del servidor) cuando llegan nuevos datos.
  const [optimisticDoc, setOptimisticDoc] = useState<ClientDocumentation>(data);

  // ghostComments: comentarios mostrados optimistamente, reconciliados al recibir
  // del servidor un comentario real con mismo author_id + body.
  const [ghostComments, setGhostComments] = useState<GhostMap>(new Map());

  // Patrón "ajustar estado durante render" (recomendado por React para state
  // derivado de props): cuando llega un `data` nuevo, sincronizamos optimisticDoc
  // y reconciliamos ghosts (descartamos los que ya tengan equivalente real).
  const [prevData, setPrevData] = useState<ClientDocumentation>(data);
  if (prevData !== data) {
    setPrevData(data);
    setOptimisticDoc(data);
    setGhostComments((prev) => {
      if (prev.size === 0) return prev;
      const allApartados = data.blocks.flatMap((b) => b.apartados);
      const next = new Map(prev);
      let changed = false;
      for (const [aId, ghosts] of prev.entries()) {
        const real = allApartados.find((a) => a.id === aId);
        if (!real) {
          next.delete(aId);
          changed = true;
          continue;
        }
        const remaining = ghosts.filter(
          (g) =>
            !real.comments.some(
              (rc) => rc.author_id === g.author_id && rc.body === g.body
            )
        );
        if (remaining.length !== ghosts.length) {
          changed = true;
          if (remaining.length === 0) next.delete(aId);
          else next.set(aId, remaining);
        }
      }
      return changed ? next : prev;
    });
  }

  const displayedDoc = useMemo<ClientDocumentation>(
    () => ({
      ...optimisticDoc,
      blocks: optimisticDoc.blocks.map((b) => ({
        ...b,
        apartados: b.apartados.map((a) => {
          const ghosts = ghostComments.get(a.id);
          if (!ghosts || ghosts.length === 0) return a;
          return { ...a, comments: [...a.comments, ...ghosts] };
        }),
      })),
    }),
    [optimisticDoc, ghostComments]
  );

  function mutateApartado(
    id: string,
    fn: (a: ClientApartado) => ClientApartado
  ) {
    setOptimisticDoc((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => ({
        ...b,
        apartados: b.apartados.map((a) => (a.id === id ? fn(a) : a)),
      })),
    }));
  }

  // ─── Wrappers optimistas ────────────────────────────────────────────
  function buildHistoryEntry(
    apartado: ClientApartado,
    to: ApartadoStatus,
    reason: string | null = null
  ): ApartadoStatusHistoryEntry {
    return {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from_status: apartado.status,
      to_status: to,
      changed_by: currentUserId,
      changed_by_name: currentUserName ?? null,
      changed_at: new Date().toISOString(),
      reason,
    };
  }

  async function optimisticValidate(clientApartadoId: string): Promise<void> {
    if (!handlers.validate) return;
    const snapshot = optimisticDoc;
    mutateApartado(clientApartadoId, (a) => ({
      ...a,
      status: "validado",
      validated_at: new Date().toISOString(),
      validated_by: currentUserId,
      rejected_at: null,
      rejected_by: null,
      last_rejection_reason: null,
      history: [...a.history, buildHistoryEntry(a, "validado")],
    }));
    try {
      await handlers.validate(clientApartadoId);
    } catch (e) {
      setOptimisticDoc(snapshot);
      throw e;
    }
  }

  async function optimisticReject(
    clientApartadoId: string,
    reason: string
  ): Promise<void> {
    if (!handlers.reject) return;
    const snapshot = optimisticDoc;
    mutateApartado(clientApartadoId, (a) => ({
      ...a,
      status: "rechazado",
      rejected_at: new Date().toISOString(),
      rejected_by: currentUserId,
      last_rejection_reason: reason,
      history: [...a.history, buildHistoryEntry(a, "rechazado", reason)],
    }));
    try {
      await handlers.reject(clientApartadoId, reason);
    } catch (e) {
      setOptimisticDoc(snapshot);
      throw e;
    }
  }

  async function optimisticReopen(clientApartadoId: string): Promise<void> {
    if (!handlers.reopen) return;
    const snapshot = optimisticDoc;
    mutateApartado(clientApartadoId, (a) => {
      const hasLiveFiles = a.files.some((f) => !f.deleted_at);
      const next: ApartadoStatus = hasLiveFiles ? "enviado" : "pendiente";
      return {
        ...a,
        status: next,
        validated_at: null,
        validated_by: null,
        rejected_at: null,
        rejected_by: null,
        last_rejection_reason: null,
        history: [...a.history, buildHistoryEntry(a, next, "__event:reopened__")],
      };
    });
    try {
      await handlers.reopen(clientApartadoId);
    } catch (e) {
      setOptimisticDoc(snapshot);
      throw e;
    }
  }

  async function optimisticToggleOptional(
    clientApartadoId: string,
    isOptional: boolean
  ): Promise<void> {
    if (!handlers.toggleOptional) return;
    const snapshot = optimisticDoc;
    mutateApartado(clientApartadoId, (a) => ({ ...a, is_optional: isOptional }));
    try {
      await handlers.toggleOptional(clientApartadoId, isOptional);
    } catch (e) {
      setOptimisticDoc(snapshot);
      throw e;
    }
  }

  async function optimisticAddComment(
    clientApartadoId: string,
    body: string
  ): Promise<void> {
    const tempId = `ghost-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const ghost: ApartadoComment = {
      id: tempId,
      author_id: currentUserId,
      author_name: currentUserName ?? "Tú",
      body,
      created_at: new Date().toISOString(),
    };
    setGhostComments((prev) => {
      const next = new Map(prev);
      const arr = next.get(clientApartadoId) ?? [];
      next.set(clientApartadoId, [...arr, ghost]);
      return next;
    });
    try {
      await handlers.addComment(clientApartadoId, body);
    } catch (e) {
      setGhostComments((prev) => {
        const next = new Map(prev);
        const arr = (next.get(clientApartadoId) ?? []).filter(
          (g) => g.id !== tempId
        );
        if (arr.length === 0) next.delete(clientApartadoId);
        else next.set(clientApartadoId, arr);
        return next;
      });
      throw e;
    }
  }

  async function optimisticRemoveApartado(
    clientApartadoId: string
  ): Promise<void> {
    if (!handlers.removeApartado) return;
    const snapshot = optimisticDoc;
    setOptimisticDoc((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => ({
        ...b,
        apartados: b.apartados.filter((a) => a.id !== clientApartadoId),
      })),
    }));
    try {
      await handlers.removeApartado(clientApartadoId);
    } catch (e) {
      setOptimisticDoc(snapshot);
      throw e;
    }
  }

  async function optimisticRemoveBlock(clientBlockId: string): Promise<void> {
    if (!handlers.removeBlock) return;
    const snapshot = optimisticDoc;
    setOptimisticDoc((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== clientBlockId),
    }));
    try {
      await handlers.removeBlock(clientBlockId);
    } catch (e) {
      setOptimisticDoc(snapshot);
      throw e;
    }
  }

  // ─── Selección ──────────────────────────────────────────────────────
  const firstBlockId = displayedDoc.blocks[0]?.id ?? null;
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(firstBlockId);
  const [selectedApartadoId, setSelectedApartadoId] = useState<string | null>(
    displayedDoc.blocks[0]?.apartados[0]?.id ?? null
  );
  const [pendingRemoveBlockId, setPendingRemoveBlockId] = useState<string | null>(null);

  const selectedBlock =
    displayedDoc.blocks.find((b) => b.id === selectedBlockId) ??
    displayedDoc.blocks[0] ??
    null;
  const selectedApartado =
    selectedBlock?.apartados.find((a) => a.id === selectedApartadoId) ??
    selectedBlock?.apartados[0] ??
    null;

  function handleSelectBlock(id: string) {
    setSelectedBlockId(id);
    const block = displayedDoc.blocks.find((b) => b.id === id);
    setSelectedApartadoId(block?.apartados[0]?.id ?? null);
  }

  const candidates: DepartmentMember[] = (() => {
    if (!selectedApartado || !membersByDept) return [];
    if (selectedApartado.is_global) {
      const all: DepartmentMember[] = [];
      for (const list of Object.values(membersByDept)) all.push(...list);
      return all;
    }
    const out: DepartmentMember[] = [];
    for (const deptId of selectedApartado.department_ids) {
      out.push(...(membersByDept[deptId] ?? []));
    }
    return out;
  })();

  // ─── Stats globales ─────────────────────────────────────────────────
  // Los apartados opcionales no cuentan ni en el progreso ni en los KPIs.
  const all: ClientApartado[] = displayedDoc.blocks
    .flatMap((b) => b.apartados)
    .filter((a) => !a.is_optional);
  const total = all.length;
  const counts = all.reduce<Record<ApartadoStatus, number>>(
    (acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    },
    { pendiente: 0, enviado: 0, validado: 0, rechazado: 0 }
  );
  const validated = counts.validado;
  const pct = total === 0 ? 0 : Math.round((validated / total) * 100);
  const pendingForReminder = counts.pendiente + counts.rechazado;

  // ─── Feedback "Avisar / Recordar al cliente" (inline, sin alert nativo) ─────
  const [remindState, setRemindState] = useState<"idle" | "sending" | "sent">("idle");
  const [remindError, setRemindError] = useState<string | null>(null);
  const [showRemindModal, setShowRemindModal] = useState(false);
  const [remindComment, setRemindComment] = useState("");

  useEffect(() => {
    if (remindState !== "sent") return;
    const t = setTimeout(() => setRemindState("idle"), 3000);
    return () => clearTimeout(t);
  }, [remindState]);

  useEffect(() => {
    if (!remindError) return;
    const t = setTimeout(() => setRemindError(null), 5000);
    return () => clearTimeout(t);
  }, [remindError]);

  function openRemindModal() {
    if (!onRemindClient || remindState === "sending") return;
    setRemindError(null);
    setRemindComment("");
    setShowRemindModal(true);
  }

  async function handleConfirmRemind() {
    if (!onRemindClient) return;
    const trimmed = remindComment.trim();
    setRemindError(null);
    setRemindState("sending");
    try {
      await onRemindClient(trimmed || undefined);
      setRemindState("sent");
      setShowRemindModal(false);
      setRemindComment("");
    } catch (e) {
      setRemindState("idle");
      setRemindError(e instanceof Error ? e.message : "No se pudo enviar el aviso");
    }
  }

  const variant = isAdmin ? "admin" : "client";
  // Plurales coherentes con la pill (admin: "A revisar", cliente: "En revisión").
  const STAT_LABELS: Record<ApartadoStatus, { admin: string; client: string }> = {
    validado: { admin: "Validados", client: "Validados" },
    enviado: { admin: "A revisar", client: "En revisión" },
    rechazado: { admin: "Rechazados", client: "Rechazados" },
    pendiente: { admin: "Pendientes", client: "Pendientes" },
  };
  const stats: { key: ApartadoStatus; label: string }[] = (
    ["validado", "enviado", "rechazado", "pendiente"] as ApartadoStatus[]
  ).map((key) => ({ key, label: STAT_LABELS[key][variant] }));

  return (
    <div className="space-y-6">
      {/* Top: Progreso + KPIs */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-5 bg-white rounded-2xl border border-gray-100 px-5 py-4 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                Progreso global
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-brand-navy font-heading">
                  {pct}%
                </span>
                <span className="text-xs text-text-muted">
                  {validated} de {total} validados
                </span>
              </div>
            </div>
            {isAdmin && onRemindClient && (
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <button
                  onClick={openRemindModal}
                  disabled={pendingForReminder === 0 || remindState !== "idle"}
                  title={
                    pendingForReminder
                      ? `Enviar aviso al cliente con ${pendingForReminder} apartado${
                          pendingForReminder === 1 ? "" : "s"
                        } pendiente${pendingForReminder === 1 ? "" : "s"} o rechazado${
                          pendingForReminder === 1 ? "" : "s"
                        }`
                      : "No hay apartados pendientes ni rechazados"
                  }
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap disabled:cursor-not-allowed transition-colors ${
                    remindState === "sent"
                      ? "bg-status-validated/15 text-status-validated cursor-default"
                      : "bg-brand-teal text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  }`}
                >
                  {remindState === "sending" ? (
                    <>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="animate-spin">
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                      Enviando…
                    </>
                  ) : remindState === "sent" ? (
                    <>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Enviado
                    </>
                  ) : (
                    <>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                      Avisar / Recordar al cliente
                    </>
                  )}
                </button>
                {remindError && (
                  <p className="text-[11px] text-status-rejected text-right max-w-[220px] leading-snug">
                    {remindError}
                  </p>
                )}
                {!remindError && data.last_reminder && (
                  <p
                    className="text-[11px] text-text-muted text-right max-w-[220px] truncate"
                    title={`Último aviso enviado el ${new Date(
                      data.last_reminder.sent_at
                    ).toLocaleString("es-ES")}${
                      data.last_reminder.sent_by_name
                        ? ` por ${data.last_reminder.sent_by_name}`
                        : ""
                    }`}
                  >
                    Último aviso:
                    {data.last_reminder.sent_by_name
                      ? ` ${data.last_reminder.sent_by_name} · `
                      : " "}
                    {formatRelativeShortEs(data.last_reminder.sent_at)}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="mt-auto pt-3">
            <div className="w-full h-1.5 bg-brand-navy/[0.07] rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-teal transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-7">
          <div className="h-full grid gap-2.5 grid-cols-2">
            {stats.map((s) => (
              <div
                key={s.key}
                className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 flex items-center justify-between gap-2 min-w-0"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: statusDotColor(s.key) }}
                  />
                  <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider truncate">
                    {s.label}
                  </p>
                </div>
                <div className="flex items-baseline gap-1 flex-shrink-0">
                  <span className="text-xl font-bold text-brand-navy leading-none font-heading">
                    {counts[s.key]}
                  </span>
                  <span className="text-[10px] text-text-muted">/{total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {displayedDoc.blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
          <p className="text-sm text-text-muted">
            Aún no se ha asignado documentación.
            {isAdmin && canManage && " Pulsa “Añadir bloque” para empezar."}
          </p>
          {isAdmin && canManage && onAddBlock && (
            <button
              onClick={onAddBlock}
              className="mt-3 inline-flex items-center gap-1.5 bg-brand-teal text-white text-sm font-medium px-3.5 py-1.5 rounded-lg hover:opacity-90 cursor-pointer"
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Añadir bloque
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
          <BlockList
            blocks={displayedDoc.blocks}
            selectedBlockId={selectedBlockId}
            selectedApartadoId={selectedApartadoId}
            onSelectBlock={handleSelectBlock}
            onSelectApartado={(id) => setSelectedApartadoId(id)}
            onAddBlock={isAdmin && canManage ? onAddBlock : undefined}
            badgeVariant={variant}
            canOperate={
              isAdmin && resolveCanValidate
                ? (apartadoId) => {
                    const found = displayedDoc.blocks
                      .flatMap((b) => b.apartados)
                      .find((a) => a.id === apartadoId);
                    return found ? resolveCanValidate(found) : true;
                  }
                : undefined
            }
          />

          <main className="min-w-0">
            {selectedBlock && selectedApartado ? (
              <ApartadoDetail
                key={selectedApartado.id}
                block={selectedBlock}
                blockIndex={
                  displayedDoc.blocks.findIndex(
                    (b) => b.id === selectedBlock.id
                  ) + 1
                }
                apartado={selectedApartado}
                mode={mode}
                currentUserId={currentUserId}
                onUploadFile={(f) => handlers.uploadFile(selectedApartado.id, f)}
                onDownloadFile={(id) => handlers.downloadFile(id)}
                onDownloadTemplate={(id) => handlers.downloadTemplate(id)}
                onDeleteOwnFile={
                  handlers.deleteFile
                    ? (id) => handlers.deleteFile!(id)
                    : undefined
                }
                onAddComment={(body) =>
                  optimisticAddComment(selectedApartado.id, body)
                }
                onValidate={
                  handlers.validate
                    ? () => optimisticValidate(selectedApartado.id)
                    : undefined
                }
                onReject={
                  handlers.reject
                    ? (reason) => optimisticReject(selectedApartado.id, reason)
                    : undefined
                }
                onReopen={
                  handlers.reopen
                    ? () => optimisticReopen(selectedApartado.id)
                    : undefined
                }
                onAddSupervisor={
                  handlers.addSupervisor
                    ? (id) =>
                        handlers.addSupervisor!(selectedApartado.id, id)
                    : undefined
                }
                onRemoveSupervisor={
                  handlers.removeSupervisor
                    ? (id) =>
                        handlers.removeSupervisor!(selectedApartado.id, id)
                    : undefined
                }
                onRemoveApartado={
                  handlers.removeApartado
                    ? () => optimisticRemoveApartado(selectedApartado.id)
                    : undefined
                }
                onAddApartadoToBlock={
                  onAddApartado && canManage
                    ? () =>
                        onAddApartado(selectedBlock.id, selectedBlock.block_id)
                    : undefined
                }
                onRemoveBlock={
                  handlers.removeBlock && canManage
                    ? () => setPendingRemoveBlockId(selectedBlock.id)
                    : undefined
                }
                onToggleOptional={
                  handlers.toggleOptional
                    ? (next) =>
                        optimisticToggleOptional(selectedApartado.id, next)
                    : undefined
                }
                candidateMembers={candidates}
                canManage={canManage}
                canValidate={resolveCanValidate?.(selectedApartado) ?? false}
                canDeleteAll={!!handlers.deleteFile}
              />
            ) : (
              <p className="text-sm text-text-muted italic px-2">
                Este bloque no tiene apartados.
              </p>
            )}
          </main>
        </div>
      )}

      {pendingRemoveBlockId && handlers.removeBlock && (
        <ConfirmDialog
          title="Eliminar bloque"
          message="¿Eliminar este bloque y sus apartados de este cliente?"
          confirmLabel="Eliminar"
          destructive
          onConfirm={async () => {
            const id = pendingRemoveBlockId;
            setPendingRemoveBlockId(null);
            try {
              await optimisticRemoveBlock(id);
            } catch {
              // El revert ya se aplicó dentro de optimisticRemoveBlock
            }
          }}
          onCancel={() => setPendingRemoveBlockId(null)}
        />
      )}

      {showRemindModal && onRemindClient && (
        <RemindClientModal
          sending={remindState === "sending"}
          error={remindError}
          comment={remindComment}
          onCommentChange={setRemindComment}
          onConfirm={handleConfirmRemind}
          onCancel={() => {
            if (remindState === "sending") return;
            setShowRemindModal(false);
            setRemindComment("");
            setRemindError(null);
          }}
        />
      )}
    </div>
  );
}

// Modal para "Avisar / Recordar al cliente". Sigue el patrón del proyecto:
// ventana centrada sin backdrop oscurecido (pointer-events-none en el contenedor
// para no tapar la app, pointer-events-auto en la tarjeta).
interface RemindClientModalProps {
  sending: boolean;
  error: string | null;
  comment: string;
  onCommentChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function RemindClientModal({
  sending,
  error,
  comment,
  onCommentChange,
  onConfirm,
  onCancel,
}: RemindClientModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !sending) onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel, sending]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 pointer-events-none">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4 pointer-events-auto">
        <div>
          <h2 className="text-lg font-bold font-heading text-brand-navy">
            Avisar / Recordar al cliente
          </h2>
          <p className="text-sm text-text-muted mt-2">
            Se enviará un email al cliente con los apartados pendientes y rechazados.
          </p>
        </div>
        <div>
          <label
            htmlFor="remind-client-comment"
            className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5"
          >
            Comentario para el cliente (opcional)
          </label>
          <textarea
            id="remind-client-comment"
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            disabled={sending}
            rows={4}
            placeholder="Añade un mensaje breve, por ejemplo: necesitamos estos documentos antes del cierre del mes."
            className="w-full text-sm text-text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal disabled:opacity-50 resize-y"
          />
        </div>
        {error && <p className="text-xs text-status-rejected">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="text-sm text-text-muted hover:text-text-body px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={sending}
            className="text-sm text-white bg-brand-teal hover:bg-brand-teal/90 px-4 py-2 rounded-lg disabled:opacity-50 cursor-pointer"
          >
            {sending ? "Enviando…" : "Enviar email"}
          </button>
        </div>
      </div>
    </div>
  );
}
