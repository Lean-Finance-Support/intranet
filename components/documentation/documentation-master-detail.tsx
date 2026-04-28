"use client";

import { useState } from "react";
import type {
  ClientApartado,
  ClientDocumentation,
  DepartmentMember,
} from "@/lib/types/documentation";
import BlockList from "./block-list";
import ApartadoDetail from "./apartado-detail";
import StatusBadge from "./status-badge";

export interface DocumentationActionHandlers {
  uploadFile: (clientApartadoId: string, file: File) => Promise<void>;
  downloadFile: (fileId: string) => Promise<string>;
  downloadTemplate: (templateId: string) => Promise<string>;
  deleteOwnFile?: (fileId: string) => Promise<void>;
  addComment: (clientApartadoId: string, body: string) => Promise<void>;
  // Solo admin
  validate?: (clientApartadoId: string) => Promise<void>;
  reject?: (clientApartadoId: string, reason: string) => Promise<void>;
  addSupervisor?: (clientApartadoId: string, profileId: string) => Promise<void>;
  removeSupervisor?: (clientApartadoId: string, profileId: string) => Promise<void>;
  removeApartado?: (clientApartadoId: string) => Promise<void>;
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
              {validatedApartados} / {totalApartados} validados
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
              onSelectBlock={handleSelectBlock}
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
                    {mode === "admin" && canManage && onAddApartado && (
                      <button
                        onClick={() => onAddApartado(selectedBlock.id, selectedBlock.block_id)}
                        className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-brand-teal hover:text-brand-teal/80 font-medium cursor-pointer"
                        title="Añadir apartado a este bloque"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Añadir apartado
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedBlock.apartados.map((a) => {
                      const active = a.id === selectedApartadoId;
                      return (
                        <button
                          key={a.id}
                          onClick={() => setSelectedApartadoId(a.id)}
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                            active
                              ? "bg-brand-navy text-white border-brand-navy"
                              : "bg-white text-text-body border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <span className="truncate max-w-[160px]">{a.name}</span>
                          <StatusBadge status={a.status} size="xs" />
                        </button>
                      );
                    })}
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
                        handlers.deleteOwnFile
                          ? (id) => handlers.deleteOwnFile!(id)
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
    </div>
  );
}
