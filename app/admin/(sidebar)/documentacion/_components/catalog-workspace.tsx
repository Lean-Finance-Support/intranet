"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type {
  BlockTemplate,
  ApartadoTemplate,
  ApartadoTemplateFile,
  ApartadoDepartmentLink,
  DocumentationTag,
} from "@/lib/types/documentation";
import { findDocumentationEmailTemplate } from "@/lib/documentation/email-templates";
import {
  createBlock,
  updateBlock,
  deleteBlock,
  createApartado,
  updateApartado,
  deleteApartado,
  reorderBlocks,
  reorderApartados,
  uploadApartadoTemplate,
  deleteApartadoTemplate,
  getApartadoTemplateSignedUrlAdmin,
  getCatalogTemplatePreviewHtml,
} from "../actions";
import BlockForm from "./block-form";
import ApartadoForm from "./apartado-form";
import ConfirmDialog from "@/components/confirm-dialog";
import EmailPreviewPopover from "@/components/documentation/email-preview-popover";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

type Departments = { id: string; name: string }[];

interface Props {
  initial: {
    blocks: BlockTemplate[];
    departments: Departments;
    tags: DocumentationTag[];
    canManage: boolean;
    canRequestDocumentation: boolean;
  };
  linkPrefix: string;
}

export default function CatalogWorkspace({ initial, linkPrefix }: Props) {
  const [blocks, setBlocks] = useState(initial.blocks);
  const [, startTransition] = useTransition();
  const [creatingBlock, setCreatingBlock] = useState(false);
  const [editingBlock, setEditingBlock] = useState<BlockTemplate | null>(null);
  const [creatingApartadoBlockId, setCreatingApartadoBlockId] = useState<string | null>(null);
  const [editingApartado, setEditingApartado] = useState<{
    blockId: string;
    apartadoId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteBlock, setPendingDeleteBlock] = useState<string | null>(null);
  const [pendingDeleteApartado, setPendingDeleteApartado] = useState<{
    apartadoId: string;
    blockId: string;
  } | null>(null);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<{
    templateId: string;
    apartadoId: string;
    blockId: string;
  } | null>(null);

  // Drag & drop state
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [draggedApartado, setDraggedApartado] = useState<{
    blockId: string;
    apartadoId: string;
  } | null>(null);
  const [dropIndicatorBlock, setDropIndicatorBlock] = useState<{
    targetId: string;
    position: "before" | "after";
  } | null>(null);
  const [dropIndicatorApartado, setDropIndicatorApartado] = useState<{
    targetId: string;
    position: "before" | "after";
  } | null>(null);

  function clearBlockDrop() {
    setDraggedBlockId(null);
    setDropIndicatorBlock(null);
  }
  function clearApartadoDrop() {
    setDraggedApartado(null);
    setDropIndicatorApartado(null);
  }

  function showError(e: unknown) {
    setError(e instanceof Error ? e.message : "Error inesperado");
    setTimeout(() => setError(null), 4000);
  }

  async function handleReorderBlocks(
    srcId: string,
    targetId: string,
    position: "before" | "after"
  ) {
    if (srcId === targetId) return;
    const srcIdx = blocks.findIndex((b) => b.id === srcId);
    const tgtIdx = blocks.findIndex((b) => b.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const next = [...blocks];
    const [moved] = next.splice(srcIdx, 1);
    // Después de splice, el índice de target puede haber cambiado si srcIdx < tgtIdx
    const insertIdx = next.findIndex((b) => b.id === targetId);
    next.splice(position === "before" ? insertIdx : insertIdx + 1, 0, moved);
    setBlocks(next);
    try {
      await reorderBlocks(next.map((b) => b.id));
    } catch (e) {
      showError(e);
    }
  }

  async function handleReorderApartados(
    blockId: string,
    srcId: string,
    targetId: string,
    position: "before" | "after"
  ) {
    if (srcId === targetId) return;
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const srcIdx = block.apartados.findIndex((a) => a.id === srcId);
    const tgtIdx = block.apartados.findIndex((a) => a.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const nextApartados = [...block.apartados];
    const [moved] = nextApartados.splice(srcIdx, 1);
    const insertIdx = nextApartados.findIndex((a) => a.id === targetId);
    nextApartados.splice(position === "before" ? insertIdx : insertIdx + 1, 0, moved);
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, apartados: nextApartados } : b))
    );
    try {
      await reorderApartados(blockId, nextApartados.map((a) => a.id));
    } catch (e) {
      showError(e);
    }
  }

  async function handleCreateBlock(input: {
    name: string;
    slug: string;
    description: string | null;
    display_order: number;
  }) {
    try {
      const created = await createBlock(input);
      setBlocks((prev) => [...prev, created].sort(sortBlocks));
      setCreatingBlock(false);
    } catch (e) {
      showError(e);
    }
  }

  async function handleUpdateBlock(
    blockId: string,
    input: {
      name: string;
      slug: string;
      description: string | null;
      display_order: number;
    }
  ) {
    try {
      await updateBlock(blockId, input);
      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, ...input } : b)).sort(sortBlocks)
      );
      setEditingBlock(null);
    } catch (e) {
      showError(e);
    }
  }

  async function handleDeleteBlock(blockId: string) {
    startTransition(async () => {
      try {
        await deleteBlock(blockId);
        setBlocks((prev) => prev.filter((b) => b.id !== blockId));
      } catch (e) {
        showError(e);
      }
    });
  }

  async function handleCreateApartado(input: {
    block_id: string;
    name: string;
    description: string | null;
    display_order: number;
    is_global: boolean;
    is_optional_global: boolean;
    departments: ApartadoDepartmentLink[];
    tag_ids: string[];
    email_template_slug: string | null;
  }) {
    try {
      const created = await createApartado(input);
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === input.block_id
            ? { ...b, apartados: [...b.apartados, created].sort(sortApartados) }
            : b
        )
      );
      setCreatingApartadoBlockId(null);
    } catch (e) {
      showError(e);
    }
  }

  async function handleUpdateApartado(
    apartadoId: string,
    blockId: string,
    input: {
      name: string;
      description: string | null;
      display_order: number;
      is_global: boolean;
      is_optional_global: boolean;
      departments: ApartadoDepartmentLink[];
      tag_ids: string[];
      email_template_slug: string | null;
    }
  ) {
    try {
      await updateApartado(apartadoId, input);
      const departments = input.is_global ? [] : input.departments;
      setBlocks((prev) =>
        prev.map((b) =>
          b.id !== blockId
            ? b
            : {
                ...b,
                apartados: b.apartados
                  .map((a) =>
                    a.id !== apartadoId
                      ? a
                      : {
                          ...a,
                          ...input,
                          departments,
                          department_ids: departments.map((d) => d.department_id),
                          tag_ids: input.tag_ids,
                        }
                  )
                  .sort(sortApartados),
              }
        )
      );
      setEditingApartado(null);
    } catch (e) {
      showError(e);
    }
  }

  async function handleDeleteApartado(apartadoId: string, blockId: string) {
    startTransition(async () => {
      try {
        await deleteApartado(apartadoId);
        setBlocks((prev) =>
          prev.map((b) =>
            b.id !== blockId
              ? b
              : { ...b, apartados: b.apartados.filter((a) => a.id !== apartadoId) }
          )
        );
      } catch (e) {
        showError(e);
      }
    });
  }

  async function handleUploadTemplate(apartadoId: string, blockId: string, file: File) {
    try {
      const fileBase64 = await fileToBase64(file);
      const created = await uploadApartadoTemplate({
        apartadoId,
        fileName: file.name,
        fileBase64,
        mimeType: file.type || "application/octet-stream",
      });
      setBlocks((prev) =>
        prev.map((b) =>
          b.id !== blockId
            ? b
            : {
                ...b,
                apartados: b.apartados.map((a) =>
                  a.id !== apartadoId ? a : { ...a, templates: [...a.templates, created] }
                ),
              }
        )
      );
    } catch (e) {
      showError(e);
    }
  }

  async function handleDeleteTemplate(templateId: string, apartadoId: string, blockId: string) {
    try {
      await deleteApartadoTemplate(templateId);
      setBlocks((prev) =>
        prev.map((b) =>
          b.id !== blockId
            ? b
            : {
                ...b,
                apartados: b.apartados.map((a) =>
                  a.id !== apartadoId
                    ? a
                    : { ...a, templates: a.templates.filter((t) => t.id !== templateId) }
                ),
              }
        )
      );
    } catch (e) {
      showError(e);
    }
  }

  return (
    <div className="min-h-full px-8 py-12">
      <div className="max-w-7xl">
        <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
              Catálogo de documentación
            </h1>
            <p className="text-text-muted text-sm mt-2 max-w-xl">
              Define los bloques y apartados que después se asignan a cada cliente.
              Cada apartado puede pertenecer a uno o varios departamentos (o ser global)
              y solo los miembros de esos departamentos pueden ser asignados como
              supervisor.
            </p>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            {initial.canRequestDocumentation && (
              <Link
                href={`${linkPrefix}/documentacion/asignacion-multiple`}
                className="inline-flex items-center gap-1.5 bg-brand-navy text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:bg-brand-navy/90 transition-colors cursor-pointer"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                Asignación múltiple
              </Link>
            )}
            {initial.canManage && (
              <button
                onClick={() => setCreatingBlock(true)}
                className="inline-flex items-center gap-1.5 bg-brand-teal text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nuevo bloque
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        {!initial.canManage && (
          <p className="mt-6 text-sm text-text-muted bg-white rounded-xl px-4 py-3 border border-gray-100 flex items-start gap-2">
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0 mt-0.5"
              aria-hidden
            >
              <rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>
              Estás viendo el catálogo en modo lectura. Para editarlo necesitas el
              permiso correspondiente.
            </span>
          </p>
        )}

        <div className="mt-8 space-y-4">
          {blocks.length === 0 && (
            <p className="text-sm text-text-muted italic">
              Aún no hay bloques en el catálogo.
            </p>
          )}
          {blocks.map((block, blockIdx) => {
            const showLineBefore =
              dropIndicatorBlock?.targetId === block.id &&
              dropIndicatorBlock.position === "before" &&
              draggedBlockId &&
              draggedBlockId !== block.id;
            const showLineAfter =
              dropIndicatorBlock?.targetId === block.id &&
              dropIndicatorBlock.position === "after" &&
              draggedBlockId &&
              draggedBlockId !== block.id;
            return (
            <div key={block.id} className="relative">
              {showLineBefore && (
                <div className="absolute -top-2 left-0 right-0 h-0.5 bg-brand-teal rounded-full pointer-events-none z-10" />
              )}
              {showLineAfter && (
                <div className="absolute -bottom-2 left-0 right-0 h-0.5 bg-brand-teal rounded-full pointer-events-none z-10" />
              )}
            <div
              draggable={initial.canManage}
              onDragStart={(e) => {
                if (draggedApartado) return;
                setDraggedBlockId(block.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (draggedBlockId && draggedBlockId !== block.id) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  setDropIndicatorBlock((prev) =>
                    prev?.targetId === block.id && prev.position === position
                      ? prev
                      : { targetId: block.id, position }
                  );
                }
              }}
              onDragLeave={(e) => {
                // Solo limpiar si el cursor sale del propio elemento (no de hijos)
                const related = e.relatedTarget as Node | null;
                if (related && e.currentTarget.contains(related)) return;
                if (dropIndicatorBlock?.targetId === block.id) setDropIndicatorBlock(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (
                  draggedBlockId &&
                  draggedBlockId !== block.id &&
                  dropIndicatorBlock?.targetId === block.id
                ) {
                  handleReorderBlocks(draggedBlockId, block.id, dropIndicatorBlock.position);
                }
                clearBlockDrop();
              }}
              onDragEnd={clearBlockDrop}
              className={`bg-white rounded-2xl border border-gray-100 shadow-sm transition-opacity ${
                draggedBlockId === block.id ? "opacity-30" : ""
              }`}
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {initial.canManage && (
                    <div
                      className="flex-shrink-0 mt-1.5 text-text-muted/40 hover:text-text-muted cursor-grab active:cursor-grabbing"
                      title="Arrastra para reordenar"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="9" cy="6" r="1.4" />
                        <circle cx="15" cy="6" r="1.4" />
                        <circle cx="9" cy="12" r="1.4" />
                        <circle cx="15" cy="12" r="1.4" />
                        <circle cx="9" cy="18" r="1.4" />
                        <circle cx="15" cy="18" r="1.4" />
                      </svg>
                    </div>
                  )}
                  <div
                    className="rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{
                      width: 28,
                      height: 28,
                      backgroundColor: "white",
                      border: "1.5px solid #00B0B7",
                      color: "#00B0B7",
                    }}
                    aria-hidden
                  >
                    <span className="text-[11px] font-bold">{blockIdx + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-brand-navy font-heading">
                      {block.name}
                    </h3>
                    {block.description && (
                      <p className="text-xs text-text-muted mt-0.5" style={{ textWrap: "pretty" }}>
                        {block.description}
                      </p>
                    )}
                  </div>
                </div>
                {initial.canManage && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingBlock(block)}
                      className="text-xs text-text-muted hover:text-brand-teal hover:bg-brand-teal/8 px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setPendingDeleteBlock(block.id)}
                      className="text-xs text-text-muted hover:text-red-600 hover:bg-red-50/60 px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
              <div className="px-5 py-4 space-y-2">
                {block.apartados.length === 0 && (
                  <p className="text-xs text-text-muted italic">Sin apartados todavía.</p>
                )}
                {block.apartados.map((apartado) => (
                  <ApartadoRow
                    key={apartado.id}
                    apartado={apartado}
                    departments={initial.departments}
                    tags={initial.tags}
                    canManage={initial.canManage}
                    isDragging={
                      draggedApartado?.blockId === block.id &&
                      draggedApartado?.apartadoId === apartado.id
                    }
                    showLineBefore={
                      dropIndicatorApartado?.targetId === apartado.id &&
                      dropIndicatorApartado.position === "before" &&
                      draggedApartado?.blockId === block.id &&
                      draggedApartado?.apartadoId !== apartado.id
                    }
                    showLineAfter={
                      dropIndicatorApartado?.targetId === apartado.id &&
                      dropIndicatorApartado.position === "after" &&
                      draggedApartado?.blockId === block.id &&
                      draggedApartado?.apartadoId !== apartado.id
                    }
                    onDragStart={() =>
                      setDraggedApartado({ blockId: block.id, apartadoId: apartado.id })
                    }
                    onDragOver={(otherId, position) => {
                      if (
                        draggedApartado &&
                        draggedApartado.blockId === block.id &&
                        draggedApartado.apartadoId !== otherId
                      ) {
                        setDropIndicatorApartado((prev) =>
                          prev?.targetId === otherId && prev.position === position
                            ? prev
                            : { targetId: otherId, position }
                        );
                        return true;
                      }
                      return false;
                    }}
                    onDragLeave={(otherId) => {
                      if (dropIndicatorApartado?.targetId === otherId) setDropIndicatorApartado(null);
                    }}
                    onDrop={(otherId) => {
                      if (
                        draggedApartado &&
                        draggedApartado.blockId === block.id &&
                        draggedApartado.apartadoId !== otherId &&
                        dropIndicatorApartado?.targetId === otherId
                      ) {
                        handleReorderApartados(
                          block.id,
                          draggedApartado.apartadoId,
                          otherId,
                          dropIndicatorApartado.position
                        );
                      }
                      clearApartadoDrop();
                    }}
                    onDragEnd={clearApartadoDrop}
                    onEdit={() => setEditingApartado({ blockId: block.id, apartadoId: apartado.id })}
                    onDelete={() => setPendingDeleteApartado({ apartadoId: apartado.id, blockId: block.id })}
                  />
                ))}
                {initial.canManage && (
                  <button
                    onClick={() => setCreatingApartadoBlockId(block.id)}
                    className="text-xs font-medium text-brand-teal hover:bg-brand-teal/10 bg-brand-teal/5 px-3 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1.5 mt-2 transition-colors"
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Añadir apartado
                  </button>
                )}
              </div>
            </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Modal: nuevo bloque */}
      {creatingBlock && (
        <BlockForm
          onSubmit={handleCreateBlock}
          onClose={() => setCreatingBlock(false)}
        />
      )}
      {editingBlock && (
        <BlockForm
          initial={editingBlock}
          onSubmit={(input) => handleUpdateBlock(editingBlock.id, input)}
          onClose={() => setEditingBlock(null)}
        />
      )}

      {creatingApartadoBlockId && (
        <ApartadoForm
          blockId={creatingApartadoBlockId}
          departments={initial.departments}
          tags={initial.tags}
          onSubmit={(input) => handleCreateApartado({ ...input, block_id: creatingApartadoBlockId })}
          onClose={() => setCreatingApartadoBlockId(null)}
        />
      )}
      {editingApartado && (() => {
        const block = blocks.find((b) => b.id === editingApartado.blockId);
        const apartado = block?.apartados.find((a) => a.id === editingApartado.apartadoId);
        if (!block || !apartado) return null;
        return (
          <ApartadoForm
            blockId={block.id}
            departments={initial.departments}
            tags={initial.tags}
            initial={apartado}
            templates={apartado.templates}
            onUploadTemplate={
              initial.canManage
                ? (file) => handleUploadTemplate(apartado.id, block.id, file)
                : undefined
            }
            onDeleteTemplate={
              initial.canManage
                ? (templateId) =>
                    setPendingDeleteTemplate({ templateId, apartadoId: apartado.id, blockId: block.id })
                : undefined
            }
            onDownloadTemplate={(templateId) => getApartadoTemplateSignedUrlAdmin(templateId)}
            onSubmit={(input) => handleUpdateApartado(apartado.id, block.id, input)}
            onClose={() => setEditingApartado(null)}
          />
        );
      })()}

      {pendingDeleteBlock && (
        <ConfirmDialog
          title="Eliminar bloque"
          message="¿Eliminar este bloque del catálogo? Se borrarán también sus apartados."
          confirmLabel="Eliminar"
          destructive
          onConfirm={async () => {
            const id = pendingDeleteBlock;
            setPendingDeleteBlock(null);
            await handleDeleteBlock(id);
          }}
          onCancel={() => setPendingDeleteBlock(null)}
        />
      )}

      {pendingDeleteApartado && (
        <ConfirmDialog
          title="Eliminar apartado"
          message="¿Eliminar este apartado del catálogo?"
          confirmLabel="Eliminar"
          destructive
          onConfirm={async () => {
            const target = pendingDeleteApartado;
            setPendingDeleteApartado(null);
            await handleDeleteApartado(target.apartadoId, target.blockId);
          }}
          onCancel={() => setPendingDeleteApartado(null)}
        />
      )}

      {pendingDeleteTemplate && (
        <ConfirmDialog
          title="Eliminar plantilla"
          message="¿Eliminar esta plantilla?"
          confirmLabel="Eliminar"
          destructive
          onConfirm={async () => {
            const target = pendingDeleteTemplate;
            setPendingDeleteTemplate(null);
            await handleDeleteTemplate(target.templateId, target.apartadoId, target.blockId);
          }}
          onCancel={() => setPendingDeleteTemplate(null)}
        />
      )}
    </div>
  );
}

function ApartadoRow({
  apartado,
  departments,
  tags,
  canManage,
  isDragging,
  showLineBefore,
  showLineAfter,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onEdit,
  onDelete,
}: {
  apartado: ApartadoTemplate;
  departments: Departments;
  tags: DocumentationTag[];
  canManage: boolean;
  isDragging: boolean;
  showLineBefore: boolean;
  showLineAfter: boolean;
  onDragStart: () => void;
  onDragOver: (otherId: string, position: "before" | "after") => boolean;
  onDragLeave: (otherId: string) => void;
  onDrop: (otherId: string) => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Construimos chips de departamento con su flag is_optional para mostrar
  // visualmente cuándo el apartado es opcional para un depto concreto.
  const deptChips: { id: string; name: string; is_optional: boolean }[] =
    apartado.is_global
      ? [
          {
            id: "__global",
            name: "Global",
            is_optional: apartado.is_optional_global ?? false,
          },
        ]
      : (apartado.departments ?? []).map((link) => {
          const d = departments.find((dd) => dd.id === link.department_id);
          return {
            id: link.department_id,
            name: d?.name ?? "?",
            is_optional: link.is_optional,
          };
        });

  const apartadoTags = (apartado.tag_ids ?? [])
    .map((tid) => tags.find((t) => t.id === tid))
    .filter((t): t is DocumentationTag => !!t);

  async function handleDownloadTemplate(t: ApartadoTemplateFile) {
    const url = await getApartadoTemplateSignedUrlAdmin(t.id);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="relative">
      {showLineBefore && (
        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-brand-teal rounded-full pointer-events-none z-10" />
      )}
      {showLineAfter && (
        <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-brand-teal rounded-full pointer-events-none z-10" />
      )}
    <div
      draggable={canManage}
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const position: "before" | "after" =
          e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        if (onDragOver(apartado.id, position)) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDragLeave={(e) => {
        const related = e.relatedTarget as Node | null;
        if (related && e.currentTarget.contains(related)) return;
        e.stopPropagation();
        onDragLeave(apartado.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(apartado.id);
      }}
      onDragEnd={(e) => {
        e.stopPropagation();
        onDragEnd();
      }}
      className={`flex items-start gap-2 bg-white border border-gray-100 hover:border-gray-200 rounded-xl px-3 py-2.5 group transition-all ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      {canManage && (
        <div
          className="flex-shrink-0 mt-0.5 text-text-muted/40 hover:text-text-muted cursor-grab active:cursor-grabbing"
          title="Arrastra para reordenar"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="5" r="1.4" />
            <circle cx="15" cy="5" r="1.4" />
            <circle cx="9" cy="12" r="1.4" />
            <circle cx="15" cy="12" r="1.4" />
            <circle cx="9" cy="19" r="1.4" />
            <circle cx="15" cy="19" r="1.4" />
          </svg>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-text-body">{apartado.name}</p>
          {deptChips.map((d) => {
            const cls = apartado.is_global
              ? d.is_optional
                ? "bg-brand-navy/5 text-brand-navy/70 ring-1 ring-brand-navy/20"
                : "bg-brand-navy/10 text-brand-navy"
              : d.is_optional
                ? "bg-brand-teal/5 text-brand-teal/70 ring-1 ring-brand-teal/20"
                : "bg-brand-teal/10 text-brand-teal";
            return (
              <span
                key={d.id}
                className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-[2px] rounded-full ${cls}`}
                title={d.is_optional ? `${d.name} · opcional` : d.name}
              >
                {d.name}
                {d.is_optional && (
                  <span className="text-[9px] uppercase tracking-wider opacity-80">
                    opc.
                  </span>
                )}
              </span>
            );
          })}
          {apartadoTags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center text-[10px] font-medium px-2 py-[2px] rounded-full bg-brand-navy/8 text-brand-navy ring-1 ring-brand-navy/15"
              title={t.description ?? t.name}
            >
              # {t.name}
            </span>
          ))}
          {apartado.email_template_slug && (() => {
            const slug = apartado.email_template_slug;
            const tpl = findDocumentationEmailTemplate(slug);
            const badge = (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-[2px] rounded-full bg-amber-100 text-amber-700 cursor-help"
                title={tpl?.name ?? slug}
              >
                <svg
                  width={10}
                  height={10}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                Email asociado
              </span>
            );
            return (
              <EmailPreviewPopover
                trigger={badge}
                fetchPreview={() => getCatalogTemplatePreviewHtml(slug)}
                caption="Vista previa con datos de ejemplo"
              />
            );
          })()}
        </div>
        {apartado.description && (
          <p className="text-xs text-text-muted mt-0.5" style={{ textWrap: "pretty" }}>
            {apartado.description}
          </p>
        )}

        {/* Plantillas (solo lectura: la subida/eliminación vive dentro del modal de edición) */}
        {apartado.templates.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Plantillas
              <span className="font-normal normal-case tracking-normal text-text-muted/80">
                {" "}· {apartado.templates.length}
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {apartado.templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleDownloadTemplate(t)}
                  className="inline-flex items-center gap-1 text-[11px] bg-brand-teal/5 border border-brand-teal/20 hover:bg-brand-teal/10 rounded-full pl-2 pr-2.5 py-0.5 text-brand-teal cursor-pointer truncate max-w-[240px] transition-colors"
                  title={t.file_name}
                >
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1={12} y1={15} x2={12} y2={3} />
                  </svg>
                  <span className="truncate">{t.file_name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {canManage && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={onEdit}
            className="text-[11px] text-text-muted hover:text-brand-teal hover:bg-brand-teal/8 px-2 py-1 rounded-md cursor-pointer transition-colors"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            className="text-[11px] text-text-muted hover:text-red-600 hover:bg-red-50/60 px-2 py-1 rounded-md cursor-pointer transition-colors"
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
    </div>
  );
}

function sortBlocks(a: BlockTemplate, b: BlockTemplate) {
  return a.display_order - b.display_order || a.name.localeCompare(b.name);
}
function sortApartados(a: ApartadoTemplate, b: ApartadoTemplate) {
  return a.display_order - b.display_order || a.name.localeCompare(b.name);
}
