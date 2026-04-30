"use client";

import { useMemo, useState } from "react";
import type {
  ApartadoSupervisor,
  ApartadoTemplateFile,
  ClientApartado,
  ClientBlock,
  DepartmentMember,
} from "@/lib/types/documentation";
import StatusBadge from "./status-badge";
import ApartadoFiles from "./apartado-files";
import ApartadoComments from "./apartado-comments";
import ApartadoTemplatesList from "./apartado-templates-list";
import ConfirmDialog from "@/components/confirm-dialog";

interface Props {
  block: ClientBlock;
  apartado: ClientApartado;
  mode: "client" | "admin";
  currentUserId: string;
  onUploadFile: (file: File) => Promise<void>;
  onDownloadFile: (fileId: string) => Promise<string>;
  onDownloadTemplate: (templateId: string) => Promise<string>;
  onDeleteOwnFile?: (fileId: string) => Promise<void>;
  onAddComment: (body: string) => Promise<void>;
  onValidate?: () => Promise<void>;
  onReject?: (reason: string) => Promise<void>;
  onReopen?: () => Promise<void>;
  onAddSupervisor?: (profileId: string) => Promise<void>;
  onRemoveSupervisor?: (profileId: string) => Promise<void>;
  onRemoveApartado?: () => Promise<void>;
  onToggleOptional?: (isOptional: boolean) => Promise<void>;
  onAddApartadoToBlock?: () => void;
  onRemoveBlock?: () => void;
  candidateMembers?: DepartmentMember[];
  canManage?: boolean;
  canValidate?: boolean;
  canDeleteAll?: boolean;
}

export default function ApartadoDetail({
  block,
  apartado,
  mode,
  currentUserId,
  onUploadFile,
  onDownloadFile,
  onDownloadTemplate,
  onDeleteOwnFile,
  onAddComment,
  onValidate,
  onReject,
  onReopen,
  onAddSupervisor,
  onRemoveSupervisor,
  onRemoveApartado,
  onToggleOptional,
  onAddApartadoToBlock,
  onRemoveBlock,
  candidateMembers,
  canManage,
  canValidate,
  canDeleteAll,
}: Props) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmRemoveApartado, setConfirmRemoveApartado] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);

  const isAdmin = mode === "admin";
  const hasFiles = apartado.files.some((f) => !f.deleted_at);
  const isFinalStatus =
    apartado.status === "validado" || apartado.status === "rechazado";
  const canActOnStatus = !isFinalStatus && hasFiles;

  async function handleValidate() {
    if (!onValidate) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onValidate();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error al validar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!onReject) return;
    if (!rejectReason.trim()) {
      setActionError("Indica un motivo de rechazo");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      await onReject(rejectReason.trim());
      setRejecting(false);
      setRejectReason("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error al rechazar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReopen() {
    if (!onReopen) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onReopen();
      setConfirmReopen(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error al reabrir");
    } finally {
      setSubmitting(false);
    }
  }

  const lastHistory = apartado.history[apartado.history.length - 1];

  const showBlockActions =
    isAdmin && canManage && (onAddApartadoToBlock || onRemoveBlock);

  return (
    <div className="space-y-4">
      {/* Section card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          {/* Eyebrow: Bloque XX · Block Name + acciones de bloque (admin) */}
          <div className="flex items-center justify-between gap-4 mb-3">
            <p className="text-[11px] font-medium text-brand-teal uppercase tracking-wider truncate">
              Bloque {String(block.display_order || 1).padStart(2, "0")} · {block.name}
            </p>
            {showBlockActions && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {onAddApartadoToBlock && (
                  <button
                    onClick={onAddApartadoToBlock}
                    className="text-xs font-medium text-brand-teal hover:bg-brand-teal/10 bg-brand-teal/5 px-3 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Añadir apartado
                  </button>
                )}
                {onRemoveBlock && (
                  <button
                    onClick={onRemoveBlock}
                    className="text-xs font-medium text-text-muted hover:text-red-600 hover:bg-red-50/60 px-3 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                    </svg>
                    Eliminar bloque
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Título + estado + acciones del apartado (admin) */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold tracking-tight text-brand-navy font-heading">
                  {apartado.name}
                </h2>
                <StatusBadge status={apartado.status} variant={isAdmin ? "admin" : "client"} />
                {apartado.is_optional && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-brand-navy/8 text-brand-navy border border-brand-navy/15"
                    title="Apartado opcional — no cuenta en el progreso"
                  >
                    Opcional
                  </span>
                )}
              </div>
              {apartado.description && (
                <p className="text-sm text-text-muted mt-1.5" style={{ textWrap: "pretty" }}>
                  {apartado.description}
                </p>
              )}
            </div>
            {isAdmin && canManage && (onToggleOptional || onRemoveApartado) && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {onToggleOptional && (
                  <button
                    onClick={async () => {
                      setSubmitting(true);
                      setActionError(null);
                      try {
                        await onToggleOptional(!apartado.is_optional);
                      } catch (e) {
                        setActionError(e instanceof Error ? e.message : "Error");
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    disabled={submitting}
                    className={`text-xs px-2.5 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1 disabled:opacity-50 ${
                      apartado.is_optional
                        ? "text-brand-navy bg-brand-navy/8 hover:bg-brand-navy/15"
                        : "text-text-muted hover:text-brand-navy hover:bg-brand-navy/8"
                    }`}
                    title={
                      apartado.is_optional
                        ? "Quitar marca de opcional (volverá a contar en el progreso)"
                        : "Marcar como opcional (no contará en el progreso)"
                    }
                  >
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      {apartado.is_optional ? (
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      ) : (
                        <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      )}
                    </svg>
                    {apartado.is_optional ? "Opcional" : "Marcar opcional"}
                  </button>
                )}
                {onRemoveApartado && (
                  <button
                    onClick={() => setConfirmRemoveApartado(true)}
                    className="text-xs text-text-muted hover:text-red-600 px-2.5 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1"
                    title="Quitar apartado del cliente"
                  >
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                    </svg>
                    Eliminar apartado
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Banner motivo de rechazo (full-width) */}
          {apartado.status === "rechazado" && apartado.last_rejection_reason && (
            <div
              className="mt-3 text-xs rounded-lg px-3 py-2"
              style={{
                color: "#B91C1C",
                backgroundColor: "rgba(185,28,28,0.06)",
                border: "1px solid rgba(185,28,28,0.20)",
              }}
            >
              <span className="font-semibold">Motivo del rechazo:</span>{" "}
              {apartado.last_rejection_reason}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 bg-gray-50/30">
          {isAdmin && onAddSupervisor && onRemoveSupervisor && canManage && candidateMembers && (
            <SupervisorAssign
              supervisors={apartado.supervisors}
              members={candidateMembers}
              onAdd={onAddSupervisor}
              onRemove={onRemoveSupervisor}
            />
          )}

          {apartado.templates.length > 0 && (
            <ApartadoTemplatesList
              templates={apartado.templates}
              onDownload={onDownloadTemplate}
              helperLabel={!isAdmin ? "Plantillas que Lean Finance pone a tu disposición" : undefined}
            />
          )}

          <ApartadoFiles
            files={apartado.files}
            canUpload={
              apartado.status !== "validado" &&
              (mode === "client" || (mode === "admin" && !!canManage))
            }
            canDeleteOwn={mode === "client" && apartado.status !== "validado"}
            canDeleteAll={!!canDeleteAll && apartado.status !== "validado"}
            ownerId={currentUserId}
            onUpload={onUploadFile}
            onDelete={onDeleteOwnFile}
            onDownload={onDownloadFile}
          />

          {/* Acciones validar/rechazar (solo admin con permiso) */}
          {isAdmin && canValidate && (
            <div className="space-y-2 pt-1">
              {isFinalStatus ? (
                onReopen && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-text-muted">
                      {apartado.status === "validado"
                        ? "Apartado validado. Puedes reabrirlo si necesitas ajustes."
                        : "Apartado rechazado. Reabrir lo deja de nuevo pendiente al cliente."}
                    </span>
                    <button
                      onClick={() => {
                        setConfirmReopen(true);
                        setActionError(null);
                      }}
                      disabled={submitting}
                      className="text-sm font-medium px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 inline-flex items-center gap-2 border border-gray-200 bg-white text-brand-navy hover:bg-gray-50"
                    >
                      Reabrir apartado
                    </button>
                  </div>
                )
              ) : !canActOnStatus ? (
                <p className="text-[11px] text-text-muted">
                  El cliente aún no ha subido archivos.
                </p>
              ) : !rejecting ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleValidate}
                    disabled={submitting}
                    className="text-sm font-semibold text-white px-4 py-2 rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2 bg-brand-teal"
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Validar
                  </button>
                  <button
                    onClick={() => {
                      setRejecting(true);
                      setActionError(null);
                    }}
                    disabled={submitting}
                    className="text-sm font-medium px-4 py-2 rounded-lg cursor-pointer disabled:opacity-40 inline-flex items-center gap-2 border bg-white hover:bg-red-50/40"
                    style={{
                      color: "#B91C1C",
                      borderColor: "rgba(185,28,28,0.30)",
                    }}
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 6l12 12M6 18L18 6" />
                    </svg>
                    Rechazar
                  </button>
                  {lastHistory && (
                    <span className="text-[11px] text-text-muted ml-auto">
                      Última actividad:{" "}
                      {new Date(lastHistory.changed_at).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    autoFocus
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Motivo del rechazo (visible para el cliente)"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
                    style={{ boxShadow: "none" }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor = "rgba(185,28,28,0.4)")
                    }
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleReject}
                      disabled={submitting}
                      className="text-sm font-medium px-4 py-2 rounded-lg cursor-pointer disabled:opacity-40 inline-flex items-center gap-2 border bg-white"
                      style={{
                        color: "#B91C1C",
                        borderColor: "rgba(185,28,28,0.30)",
                      }}
                    >
                      Confirmar rechazo
                    </button>
                    <button
                      onClick={() => {
                        setRejecting(false);
                        setRejectReason("");
                        setActionError(null);
                      }}
                      disabled={submitting}
                      className="text-sm font-medium text-text-muted hover:text-text-body px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              {actionError && (
                <p className="text-xs text-red-500">{actionError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Comentarios + historial */}
      <ApartadoComments
        comments={apartado.comments}
        history={isAdmin ? apartado.history : []}
        currentUserId={currentUserId}
        onAdd={onAddComment}
      />

      {confirmRemoveApartado && onRemoveApartado && (
        <ConfirmDialog
          title="Quitar apartado"
          message="¿Quitar este apartado del cliente?"
          confirmLabel="Quitar"
          destructive
          onConfirm={async () => {
            try {
              await onRemoveApartado();
              setConfirmRemoveApartado(false);
            } catch (e) {
              setActionError(e instanceof Error ? e.message : "Error");
              setConfirmRemoveApartado(false);
            }
          }}
          onCancel={() => setConfirmRemoveApartado(false)}
        />
      )}

      {confirmReopen && onReopen && (
        <ConfirmDialog
          title="Reabrir apartado"
          message={
            apartado.status === "validado"
              ? "Se quitará la validación y el apartado volverá a estar abierto."
              : "Se descartará el rechazo y el apartado volverá a estar abierto."
          }
          confirmLabel="Reabrir"
          onConfirm={handleReopen}
          onCancel={() => setConfirmReopen(false)}
        />
      )}
    </div>
  );
}

// ── Multi-supervisor: chips + selector ──────────────────────────────────────
function SupervisorAssign({
  supervisors,
  members,
  onAdd,
  onRemove,
}: {
  supervisors: ApartadoSupervisor[];
  members: DepartmentMember[];
  onAdd: (profileId: string) => Promise<void>;
  onRemove: (profileId: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uniqueMembers = useMemo(
    () => Array.from(new Map(members.map((m) => [m.id, m])).values()),
    [members]
  );

  const assignedIds = new Set(supervisors.map((s) => s.id));
  const candidates = uniqueMembers.filter((m) => !assignedIds.has(m.id));

  const depts = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of candidates) map.set(m.department_id, m.department_name);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [candidates]);

  const hasMultipleDepts = depts.length > 1;
  const filteredCandidates =
    hasMultipleDepts && selectedDeptId
      ? candidates.filter((m) => m.department_id === selectedDeptId)
      : candidates;

  async function handleSelect(id: string) {
    if (!id) return;
    setPending(true);
    setError(null);
    try {
      await onAdd(id);
      setAdding(false);
      setSelectedDeptId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al añadir supervisor");
    } finally {
      setPending(false);
    }
  }

  async function handleRemove(id: string) {
    setPending(true);
    setError(null);
    try {
      await onRemove(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al quitar supervisor");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
        Supervisores
        <span className="font-normal normal-case tracking-normal text-text-muted/80">
          {" "}
          · {supervisors.length}
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {supervisors.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white border border-gray-200 text-text-body"
          >
            {s.full_name ?? s.email}
            <button
              onClick={() => handleRemove(s.id)}
              disabled={pending}
              className="text-text-muted hover:text-red-600 cursor-pointer disabled:opacity-50"
              aria-label={`Quitar ${s.full_name ?? s.email}`}
            >
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </span>
        ))}
        {supervisors.length === 0 && !adding && (
          <span className="text-xs text-text-muted italic">
            Sin supervisores asignados
          </span>
        )}
        {!adding && candidates.length > 0 && (
          <button
            onClick={() => {
              setAdding(true);
              setError(null);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-brand-teal hover:bg-brand-teal/8 cursor-pointer"
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Añadir supervisor
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {hasMultipleDepts && (
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              disabled={pending}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-brand-teal disabled:opacity-50"
            >
              <option value="">— Departamento —</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <select
            defaultValue=""
            onChange={(e) => handleSelect(e.target.value)}
            disabled={pending}
            className="flex-1 min-w-[200px] text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-brand-teal disabled:opacity-50"
          >
            <option value="">— Persona —</option>
            {filteredCandidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name ?? m.email}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setAdding(false);
              setSelectedDeptId("");
              setError(null);
            }}
            className="text-xs text-text-muted hover:text-text-body cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </section>
  );
}

export type { ApartadoTemplateFile };
