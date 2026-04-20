"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getEligibleProfilesForDept,
  addDeptMember,
  type EligibleProfile,
  type DeptRoleKind,
} from "@/app/admin/departamento/actions";

interface Props {
  deptId: string;
  deptName: string;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddDeptMemberModal({ deptId, deptName, onClose, onAdded }: Props) {
  const [profiles, setProfiles] = useState<EligibleProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [kind, setKind] = useState<DeptRoleKind>("miembro");
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  useEffect(() => {
    let cancelled = false;
    getEligibleProfilesForDept(deptId)
      .then((rows) => {
        if (!cancelled) setProfiles(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error cargando perfiles");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deptId]);

  function handleAdd() {
    if (!selectedId) return;
    setError("");
    startTransition(async () => {
      try {
        await addDeptMember(selectedId, deptId, kind);
        onAdded();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al añadir");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={() => !pending && onClose()}
      />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold font-heading text-brand-navy">
              Añadir a {deptName}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Selecciona un empleado y su rol en el departamento.
            </p>
          </div>
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

        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-1">Empleado</label>
          {loading ? (
            <p className="text-xs text-text-muted">Cargando…</p>
          ) : profiles.length === 0 ? (
            <p className="text-xs text-text-muted italic">
              Todos los empleados admin ya están en este departamento.
            </p>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={pending}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-teal"
            >
              <option value="">— Selecciona un empleado —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-1">Rol</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: "miembro" as DeptRoleKind, label: "Miembro", hint: "Pertenece y lee" },
              { v: "operador" as DeptRoleKind, label: "Operador", hint: "Opera sin pertenecer" },
              { v: "observador" as DeptRoleKind, label: "Observador", hint: "Solo lectura" },
            ]).map((opt) => (
              <button
                key={opt.v}
                type="button"
                disabled={pending}
                onClick={() => setKind(opt.v)}
                className={`text-xs px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                  kind === opt.v
                    ? "bg-brand-navy text-white border-brand-navy"
                    : "bg-white text-brand-navy border-gray-200 hover:border-brand-navy/40"
                }`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-[10px] opacity-80">{opt.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={!selectedId || pending || profiles.length === 0}
          className="w-full text-sm font-medium bg-brand-teal text-white rounded-lg px-4 py-2.5 hover:bg-brand-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {pending ? "Añadiendo…" : "Añadir al departamento"}
        </button>
      </div>
    </div>
  );
}
