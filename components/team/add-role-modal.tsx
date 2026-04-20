"use client";

import { useEffect, useState, useTransition } from "react";
import { grantBackofficeRole } from "@/app/admin/departamento/permissions-actions";

export interface AvailableRole {
  key: string; // identificador interno (ej. 'backoffice')
  label: string; // nombre visible
  maxLevel: 1 | 2; // nivel máximo que el usuario puede otorgar para este rol
}

interface Props {
  targetProfileId: string;
  availableRoles: AvailableRole[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AddRoleModal({
  targetProfileId,
  availableRoles,
  onClose,
  onSaved,
}: Props) {
  const [selected, setSelected] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<1 | 2>(1);
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const selectedRole = availableRoles.find((r) => r.key === selected);
  const maxLevel = selectedRole?.maxLevel ?? 1;
  const effectiveLevel = (Math.min(selectedLevel, maxLevel) || 1) as 1 | 2;

  function handleSave() {
    if (!selected) return;
    setError("");
    startTransition(async () => {
      try {
        if (selected === "backoffice") {
          await grantBackofficeRole(targetProfileId, effectiveLevel);
        } else {
          throw new Error("Rol no reconocido.");
        }
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al otorgar el rol");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={() => !pending && onClose()}
      />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold font-heading text-brand-navy">Añadir rol</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5">{error}</div>
        )}

        {availableRoles.length === 0 ? (
          <p className="text-xs text-text-muted italic">
            No hay roles que puedas otorgar a este empleado.
          </p>
        ) : (
          <>
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1">Rol</label>
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setSelectedLevel(1);
                }}
                disabled={pending}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-teal"
              >
                <option value="">— Selecciona un rol —</option>
                {availableRoles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div>
                <label className="block text-[11px] font-medium text-text-muted mb-1">Nivel</label>
                <div className="flex gap-2">
                  {[1, 2].map((lvl) => {
                    const disabled = lvl > maxLevel;
                    const active = effectiveLevel === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        disabled={disabled || pending}
                        onClick={() => setSelectedLevel(lvl as 1 | 2)}
                        className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          active
                            ? "bg-brand-navy text-white border-brand-navy"
                            : "bg-white text-brand-navy border-gray-200 hover:border-brand-navy/40"
                        }`}
                      >
                        <div className="font-semibold">N{lvl}</div>
                        <div className="text-[10px] opacity-80">
                          {lvl === 1 ? "Solo usa el rol" : "Usa + puede otorgarlo"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={!selected || pending}
              className="w-full text-sm font-medium bg-brand-teal text-white rounded-lg px-4 py-2.5 hover:bg-brand-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {pending ? "Guardando…" : "Otorgar rol"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
