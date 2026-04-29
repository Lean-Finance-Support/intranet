"use client";

import { useState } from "react";
import type {
  ClientApartado,
  ClientDocumentation,
  DepartmentMember,
} from "@/lib/types/documentation";
import BlockList from "./block-list";
import ApartadoDetail from "./apartado-detail";
import ConfirmDialog from "@/components/confirm-dialog";

export interface DocumentationActionHandlers {
  uploadFile: (clientApartadoId: string, file: File) => Promise<void>;
  downloadFile: (fileId: string) => Promise<string>;
  downloadTemplate: (templateId: string) => Promise<string>;
  deleteFile?: (fileId: string) => Promise<void>;
  addComment: (clientApartadoId: string, body: string) => Promise<void>;
  // Solo admin
  validate?: (clientApartadoId: string) => Promise<void>;
  reject?: (clientApartadoId: string, reason: string) => Promise<void>;
  reopen?: (clientApartadoId: string) => Promise<void>;
  addSupervisor?: (clientApartadoId: string, profileId: string) => Promise<void>;
  removeSupervisor?: (clientApartadoId: string, profileId: string) => Promise<void>;
  removeApartado?: (clientApartadoId: string) => Promise<void>;
  removeBlock?: (clientBlockId: string) => Promise<void>;
}

interface Props {
  data: ClientDocumentation;
  mode: "client" | "admin";
  currentUserId: string;
  handlers: DocumentationActionHandlers;
  // Admin: candidatos a supervisor por dept; resolución de canValidate por apartado
  membersByDept?: Record<string, DepartmentMember[]>;
  canManage?: boolean;
  resolveCanValidate?: (apartado: ClientApartado) => boolean;
  // Admin: header con barra de progreso global y botones de acción
  topRightSlot?: React.ReactNode;
  // Admin: callback para abrir el modal de añadir apartado sobre un bloque concreto
  onAddApartado?: (clientBlockId: string, catalogBlockId: string) => void;
}

export default function DocumentationMasterDetail({
  data,
  mode,
  currentUserId,
  handlers,
  membersByDept,
  canManage,
  resolveCanValidate,
  topRightSlot,
  onAddApartado,
}: Props) {
  const firstBlockId = data.blocks[0]?.id ?? null;
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(firstBlockId);
  const [selectedApartadoId, setSelectedApartadoId] = useState<string | null>(
    data.blocks[0]?.apartados[0]?.id ?? null
  );
  const [pendingRemoveBlockId, setPendingRemoveBlockId] = useState<string | null>(null);

  // Resolver selección efectiva en cada render: si la actual ya no existe (datos
  // revalidados), caemos al primer bloque/apartado disponible.
  const selectedBlock =
    data.blocks.find((b) => b.id === selectedBlockId) ?? data.blocks[0] ?? null;
  const selectedApartado =
    selectedBlock?.apartados.find((a) => a.id === selectedApartadoId) ??
    selectedBlock?.apartados[0] ??
    null;

  function handleSelectBlock(id: string) {
    setSelectedBlockId(id);
    const block = data.blocks.find((b) => b.id === id);
    setSelectedApartadoId(block?.apartados[0]?.id ?? null);
  }

  // Candidatos a supervisor para el apartado seleccionado
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

  const totalApartados = data.total_apartados;
  const validatedApartados = data.validated_apartados;
  const pct = totalApartados === 0 ? 0 : Math.round((validatedApartados / totalApartados) * 100);

  return (
    <div className="space-y-5">
      {/* Header con progreso global */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
              Progreso global
            </p>
            <p className="text-2xl font-bold text-brand-navy tabular-nums">
              {pct}
              <span className="text-base font-medium text-text-muted">%</span>
            </p>
            <p className="text-[11px] text-text-muted">
              {validatedApartados} de {totalApartados} validados
            </p>
          </div>
          <div className="hidden md:flex w-72 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-teal transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {topRightSlot}
      </div>

      {data.blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
          <p className="text-sm text-text-muted">
            Aún no se ha asignado documentación.
            {mode === "admin" && canManage && " Pulsa “Añadir bloque” para empezar."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
          <div>
            <BlockList
              blocks={data.blocks}
              selectedBlockId={selectedBlockId}
              selectedApartadoId={selectedApartadoId}
              onSelectBlock={handleSelectBlock}
              onSelectApartado={(id) => setSelectedApartadoId(id)}
              showInReview={mode === "admin"}
              badgeVariant={mode === "client" ? "client" : "default"}
            />
          </div>

          <div className="min-w-0">
            {selectedBlock && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                {/* Header del bloque + tabs de apartados */}
                <div className="px-5 py-4 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-brand-navy">
                        {selectedBlock.name}
                      </h2>
                      {selectedBlock.description && (
                        <p className="text-xs text-text-muted mt-0.5">{selectedBlock.description}</p>
                      )}
                    </div>
                    {mode === "admin" && canManage && (
                      <div className="flex-shrink-0 flex items-center gap-3">
                        {onAddApartado && (
                          <button
                            onClick={() => onAddApartado(selectedBlock.id, selectedBlock.block_id)}
                            className="inline-flex items-center gap-1 text-xs text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer"
                            title="Añadir apartado a este bloque"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Añadir apartado
                          </button>
                        )}
                        {handlers.removeBlock && (
                          <button
                            onClick={() => setPendingRemoveBlockId(selectedBlock.id)}
                            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-red-500 font-medium cursor-pointer"
                            title="Eliminar bloque del cliente"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            Eliminar bloque
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-5 py-5">
                  {selectedApartado ? (
                    <ApartadoDetail
                      key={selectedApartado.id}
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
                      onAddComment={(body) => handlers.addComment(selectedApartado.id, body)}
                      onValidate={
                        handlers.validate
                          ? () => handlers.validate!(selectedApartado.id)
                          : undefined
                      }
                      onReject={
                        handlers.reject
                          ? (reason) => handlers.reject!(selectedApartado.id, reason)
                          : undefined
                      }
                      onReopen={
                        handlers.reopen
                          ? () => handlers.reopen!(selectedApartado.id)
                          : undefined
                      }
                      onAddSupervisor={
                        handlers.addSupervisor
                          ? (id) => handlers.addSupervisor!(selectedApartado.id, id)
                          : undefined
                      }
                      onRemoveSupervisor={
                        handlers.removeSupervisor
                          ? (id) => handlers.removeSupervisor!(selectedApartado.id, id)
                          : undefined
                      }
                      onRemoveApartado={
                        handlers.removeApartado
                          ? () => handlers.removeApartado!(selectedApartado.id)
                          : undefined
                      }
                      candidateMembers={candidates}
                      canManage={canManage}
                      canValidate={resolveCanValidate?.(selectedApartado) ?? false}
                      canDeleteAll={!!handlers.deleteFile}
                    />
                  ) : (
                    <p className="text-sm text-text-muted italic">
                      Este bloque no tiene apartados.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {pendingRemoveBlockId && handlers.removeBlock && (
        <ConfirmDialog
          title="Eliminar bloque"
          message="¿Eliminar este bloque y sus apartados de este cliente?"
          confirmLabel="Eliminar"
          destructive
          onConfirm={async () => {
            await handlers.removeBlock!(pendingRemoveBlockId);
            setPendingRemoveBlockId(null);
          }}
          onCancel={() => setPendingRemoveBlockId(null)}
        />
      )}
    </div>
  );
}
