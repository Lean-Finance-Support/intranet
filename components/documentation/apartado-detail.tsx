"use client";

import { useMemo, useState } from "react";
import type {
  ApartadoStatus,
  ApartadoStatusHistoryEntry,
  ApartadoSupervisor,
  ApartadoTemplateFile,
  ClientApartado,
  DepartmentMember,
} from "@/lib/types/documentation";
import StatusBadge from "./status-badge";
import ApartadoFiles from "./apartado-files";
import ApartadoComments from "./apartado-comments";
import ApartadoTemplatesList from "./apartado-templates-list";
import ConfirmDialog from "@/components/confirm-dialog";

interface Props {
  apartado: ClientApartado;
  mode: "client" | "admin";
  currentUserId: string;
  onUploadFile: (file: File) => Promise<void>;
  onDownloadFile: (fileId: string) => Promise<string>;
  onDownloadTemplate: (templateId: string) => Promise<string>;
  onDeleteOwnFile?: (fileId: string) => Promise<void>;
  onAddComment: (body: string) => Promise<void>;
  // Solo admin
  onValidate?: () => Promise<void>;
  onReject?: (reason: string) => Promise<void>;
  onReopen?: () => Promise<void>;
  onAddSupervisor?: (profileId: string) => Promise<void>;
  onRemoveSupervisor?: (profileId: string) => Promise<void>;
  onRemoveApartado?: () => Promise<void>;
  candidateMembers?: DepartmentMember[];
  canManage?: boolean;
  canValidate?: boolean;
  canDeleteAll?: boolean;
}

export default function ApartadoDetail({
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

  const hasFiles = apartado.files.some((f) => !f.deleted_at);
  const isFinalStatus = apartado.status === "validado" || apartado.status === "rechazado";
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
    if (!rejectReason.trim()) { setActionError("Indica un motivo de rechazo"); return; }
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

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-brand-navy">{apartado.name}</h3>
            <StatusBadge
              status={apartado.status}
              variant={mode === "client" ? "client" : "default"}
            />
          </div>
          {apartado.description && (
            <p className="text-sm text-text-muted mt-1">{apartado.description}</p>
          )}
          {apartado.status === "rechazado" && apartado.last_rejection_reason && (
            <div className="mt-2 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-red-700">
              <span className="font-semibold">Motivo del rechazo:</span>{" "}
              {apartado.last_rejection_reason}
            </div>
          )}
        </div>
        {mode === "admin" && canManage && onRemoveApartado && (
          <button
            onClick={() => setConfirmRemoveApartado(true)}
            className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-text-muted hover:text-red-500 font-medium cursor-pointer"
            title="Quitar apartado del cliente"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Eliminar apartado
          </button>
        )}
      </div>

      {/* Supervisores (admin) */}
      {mode === "admin" && onAddSupervisor && onRemoveSupervisor && canManage && candidateMembers && (
        <div className="border border-gray-100 rounded-xl bg-gray-50/50 px-4 py-3">
          <SupervisorAssign
            supervisors={apartado.supervisors}
            members={candidateMembers}
            onAdd={onAddSupervisor}
            onRemove={onRemoveSupervisor}
          />
        </div>
      )}

      {/* Plantillas */}
      {apartado.templates.length > 0 && (
        <ApartadoTemplatesList
          templates={apartado.templates}
          onDownload={onDownloadTemplate}
        />
      )}

      <div className="border-t border-gray-100" />

      {/* Archivos */}
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

      {/* Validar / Rechazar / Reabrir (solo admin con permiso) */}
      {mode === "admin" && canValidate && (
        <div className="space-y-2">
          {isFinalStatus ? (
            onReopen && (
              <button
                onClick={() => { setConfirmReopen(true); setActionError(null); }}
                disabled={submitting}
                className="w-full text-sm font-semibold bg-white text-brand-navy border border-gray-200 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Reabrir apartado
              </button>
            )
          ) : !canActOnStatus ? (
            <p className="text-xs text-text-muted text-center py-2">
              Adjunta documentación para poder validar o rechazar.
            </p>
          ) : !rejecting ? (
            <div className="flex gap-2 w-full">
              <button
                onClick={handleValidate}
                disabled={submitting}
                className="flex-1 text-sm font-semibold bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                Validar
              </button>
              <button
                onClick={() => { setRejecting(true); setActionError(null); }}
                disabled={submitting}
                className="flex-1 text-sm font-semibold bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 cursor-pointer"
              >
                Rechazar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                autoFocus
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo del rechazo"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
              <div className="flex gap-2 w-full">
                <button
                  onClick={handleReject}
                  disabled={submitting}
                  className="flex-1 text-sm font-semibold bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 cursor-pointer"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => { setRejecting(false); setRejectReason(""); setActionError(null); }}
                  disabled={submitting}
                  className="flex-1 text-sm font-semibold bg-white text-text-muted border border-gray-200 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {actionError && <p className="text-xs text-red-500 text-center">{actionError}</p>}
        </div>
      )}

      <div className="border-t border-gray-100" />

      {/* Comentarios */}
      <ApartadoComments
        comments={apartado.comments}
        currentUserId={currentUserId}
        onAdd={onAddComment}
      />

      {/* Historial */}
      {mode === "admin" && apartado.history.length > 0 && (
        <details className="text-xs text-text-muted">
          <summary className="cursor-pointer font-medium hover:text-text-body">
            Ver historial de cambios ({apartado.history.length})
          </summary>
          <ul className="mt-2 space-y-1.5 pl-3">
            {apartado.history.map((h) => (
              <li key={h.id} className="flex gap-2">
                <span className="font-mono text-[10px] flex-shrink-0 text-text-muted/70 mt-0.5">
                  {new Date(h.changed_at).toLocaleDateString("es-ES", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
                <span className="text-text-body">{describeHistoryEntry(h)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

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

// ── Historial: descripción humana ───────────────────────────────────────────

function describeHistoryEntry(h: ApartadoStatusHistoryEntry): string {
  const actor = h.changed_by_name ?? "Alguien";
  const from = h.from_status as ApartadoStatus | null;
  const to = h.to_status;
  if (h.reason === "__event:file_uploaded__") return `${actor} adjuntó documentos`;
  if (h.reason === "__event:reopened__") {
    if (from === "validado") return `${actor} reabrió el apartado (revertió la validación)`;
    if (from === "rechazado") return `${actor} reabrió el apartado (revertió el rechazo)`;
    return `${actor} reabrió el apartado`;
  }
  if (h.reason === "__event:no_files_left__") {
    return `${actor} eliminó el último archivo (vuelve a pendiente)`;
  }
  if (from === null && to === "pendiente") return `${actor} añadió este apartado`;
  if ((from === "pendiente" || from === null) && to === "enviado") {
    return `${actor} envió documentos para revisión`;
  }
  if (from === "rechazado" && to === "enviado") {
    return `${actor} reenvió documentos tras el rechazo`;
  }
  if (from === "validado" && to === "enviado") {
    return `${actor} reabrió el apartado y subió nuevos documentos`;
  }
  if (to === "validado") return `${actor} validó el apartado`;
  if (to === "rechazado") {
    const motivo = h.reason ? ` — ${h.reason}` : "";
    return `${actor} rechazó el apartado${motivo}`;
  }
  if (to === "pendiente") return `${actor} reinició el apartado`;
  return `${actor} cambió el estado a ${to}`;
}

// ── Multi-supervisor: chips + selector dept→persona ─────────────────────────

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
  const filteredCandidates = hasMultipleDepts && selectedDeptId
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
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Supervisores {supervisors.length > 0 && `(${supervisors.length})`}
      </p>

      {/* Chips */}
      {supervisors.length === 0 && !adding ? (
        <p className="text-xs text-text-muted italic">Sin supervisores asignados</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {supervisors.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-full pl-2.5 pr-1 py-0.5"
            >
              <span className="text-text-body font-medium">{s.full_name ?? s.email}</span>
              <button
                onClick={() => handleRemove(s.id)}
                disabled={pending}
                className="ml-0.5 w-4 h-4 rounded-full text-text-muted hover:text-red-500 hover:bg-red-50 disabled:opacity-50 cursor-pointer flex items-center justify-center transition-colors"
                title="Quitar supervisor"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Selector add */}
      {!adding ? (
        candidates.length > 0 && (
          <button
            onClick={() => { setAdding(true); setError(null); }}
            className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer"
          >
            + Añadir supervisor
          </button>
        )
      ) : (
        <div className="space-y-2 pt-1">
          {hasMultipleDepts && (
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              disabled={pending}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal disabled:opacity-50"
            >
              <option value="">— Departamento —</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <select
              defaultValue=""
              onChange={(e) => handleSelect(e.target.value)}
              disabled={pending}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal disabled:opacity-50"
            >
              <option value="">— Persona —</option>
              {filteredCandidates.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
              ))}
            </select>
            <button
              onClick={() => { setAdding(false); setSelectedDeptId(""); setError(null); }}
              className="text-xs text-text-muted hover:text-text-body cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ───────── Plantillas (componente local) ─────────

export type { ApartadoTemplateFile };
