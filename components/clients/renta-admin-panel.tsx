"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  listAuthorizedFilers,
  addAuthorizedFiler,
  updateAuthorizedFiler,
  deleteAuthorizedFiler,
  getActiveInvitation,
  ensureRentaInvitation,
  revokeRentaInvitation,
  sendRentaInvitationEmail,
  listSubmissions,
  setSubmissionStatus,
  updateSubmissionNotes,
  revokeSubmission,
  getDeductionsCatalog,
} from "@/app/admin/clientes/[id]/renta-actions";
import ConfirmDialog from "@/components/confirm-dialog";
import { isValidDni, normalizeDni } from "@/lib/renta/dni";
import { CCAA_LABELS, type CCAACode } from "@/lib/types/renta";
import type {
  RentaAuthorizedFilerWithUsage,
  RentaDeduction,
  RentaExtraField,
  RentaInvitation,
  RentaSubmission,
} from "@/lib/types/renta";

interface Props {
  companyId: string;
}

export default function RentaAdminPanel({ companyId }: Props) {
  const [tab, setTab] = useState<"filers" | "link" | "submissions">("filers");
  const [filers, setFilers] = useState<RentaAuthorizedFilerWithUsage[]>([]);
  const [invitation, setInvitation] = useState<RentaInvitation | null>(null);
  const [submissions, setSubmissions] = useState<RentaSubmission[]>([]);
  const [deductions, setDeductions] = useState<RentaDeduction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [f, inv, s, d] = await Promise.all([
      listAuthorizedFilers(companyId),
      getActiveInvitation(companyId),
      listSubmissions(companyId),
      getDeductionsCatalog(),
    ]);
    setFilers(f);
    setInvitation(inv);
    setSubmissions(s);
    setDeductions(d);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [f, inv, s, d] = await Promise.all([
        listAuthorizedFilers(companyId),
        getActiveInvitation(companyId),
        listSubmissions(companyId),
        getDeductionsCatalog(),
      ]);
      if (cancelled) return;
      setFilers(f);
      setInvitation(inv);
      setSubmissions(s);
      setDeductions(d);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b border-gray-100">
        <TabButton active={tab === "filers"} onClick={() => setTab("filers")}>
          DNIs autorizados ({filers.length})
        </TabButton>
        <TabButton active={tab === "link"} onClick={() => setTab("link")}>
          Enlace público
        </TabButton>
        <TabButton active={tab === "submissions"} onClick={() => setTab("submissions")}>
          Envíos recibidos ({submissions.length})
        </TabButton>
      </div>

      {loading ? (
        <p className="text-xs text-text-muted py-4">Cargando…</p>
      ) : tab === "filers" ? (
        <AuthorizedFilersSection
          companyId={companyId}
          filers={filers}
          onChanged={refresh}
        />
      ) : tab === "link" ? (
        <PublicLinkSection
          companyId={companyId}
          invitation={invitation}
          filersCount={filers.length}
          onChanged={refresh}
        />
      ) : (
        <SubmissionsSection
          submissions={submissions}
          deductionsCatalog={deductions}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "px-3 py-2 text-xs font-semibold border-b-2 border-brand-teal text-brand-navy"
          : "px-3 py-2 text-xs font-medium text-text-muted hover:text-brand-navy"
      }
    >
      {children}
    </button>
  );
}

// ===========================================================================
// DNIs autorizados
// ===========================================================================

function AuthorizedFilersSection({
  companyId,
  filers,
  onChanged,
}: {
  companyId: string;
  filers: RentaAuthorizedFilerWithUsage[];
  onChanged: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RentaAuthorizedFilerWithUsage | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-text-muted leading-relaxed">
          El familiar deberá introducir uno de estos DNIs al entrar al formulario.
          Sin DNI autorizado, el formulario no le dejará continuar.
        </p>
        <button
          type="button"
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
          }}
          className="flex-shrink-0 text-xs font-medium bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:opacity-90"
        >
          + Añadir DNI
        </button>
      </div>

      {showForm && editingId === null && (
        <FilerForm
          companyId={companyId}
          onCancel={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await onChanged();
          }}
        />
      )}

      {filers.length === 0 ? (
        <p className="text-xs text-text-muted/80 italic py-3">
          Todavía no has añadido ningún DNI. Añade al menos uno antes de compartir el enlace.
        </p>
      ) : (
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">DNI</th>
                <th className="px-3 py-2 text-left font-medium">Nombre</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filers.map((f) =>
                editingId === f.id ? (
                  <tr key={f.id}>
                    <td colSpan={5} className="p-3">
                      <FilerForm
                        companyId={companyId}
                        initial={f}
                        onCancel={() => setEditingId(null)}
                        onSaved={async () => {
                          setEditingId(null);
                          await onChanged();
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={f.id}>
                    <td className="px-3 py-2 font-mono text-brand-navy">{f.dni}</td>
                    <td className="px-3 py-2">{f.full_name}</td>
                    <td className="px-3 py-2 text-text-muted">{f.email ?? "—"}</td>
                    <td className="px-3 py-2">
                      {f.has_submission ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700">
                          Enviado
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-amber-50 text-amber-700">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(f.id);
                          setShowForm(false);
                        }}
                        className="text-xs text-brand-navy hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(f)}
                        className="ml-3 text-xs text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Eliminar DNI autorizado"
          message={
            confirmDelete.has_submission
              ? `${confirmDelete.full_name} ya envió el formulario. No se puede eliminar.`
              : `¿Eliminar a ${confirmDelete.full_name} de la lista de autorizados? Ya no podrá entrar al formulario.`
          }
          confirmLabel={confirmDelete.has_submission ? "Cerrar" : "Eliminar"}
          destructive
          onConfirm={async () => {
            if (!confirmDelete.has_submission) {
              await deleteAuthorizedFiler(confirmDelete.id);
              await onChanged();
            }
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function FilerForm({
  companyId,
  initial,
  onCancel,
  onSaved,
}: {
  companyId: string;
  initial?: RentaAuthorizedFilerWithUsage;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [dni, setDni] = useState(initial?.dni ?? "");
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEdit = Boolean(initial);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      if (isEdit && initial) {
        const res = await updateAuthorizedFiler(initial.id, {
          full_name: fullName,
          email: email || null,
          notes: notes || null,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
      } else {
        const normalized = normalizeDni(dni);
        if (!isValidDni(normalized)) {
          setError("DNI/NIE inválido — revisa la letra.");
          return;
        }
        const res = await addAuthorizedFiler(companyId, {
          dni: normalized,
          full_name: fullName,
          email: email || null,
          notes: notes || null,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      await onSaved();
    });
  }

  return (
    <div className="space-y-2 border border-brand-teal/30 rounded-lg p-3 bg-brand-teal/5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-text-muted">DNI / NIE</span>
          <input
            type="text"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            disabled={isEdit}
            placeholder="12345678Z"
            className="text-xs font-mono px-2 py-1.5 border border-gray-200 rounded disabled:bg-gray-50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-text-muted">Nombre completo</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nombre y apellidos"
            className="text-xs px-2 py-1.5 border border-gray-200 rounded"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-text-muted">Email (opcional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="familiar@ejemplo.com"
            className="text-xs px-2 py-1.5 border border-gray-200 rounded"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-text-muted">Notas internas (opcional)</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Relación, observaciones…"
            className="text-xs px-2 py-1.5 border border-gray-200 rounded"
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded hover:bg-gray-100"
          disabled={isPending}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="text-xs font-medium px-3 py-1.5 rounded bg-brand-teal text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Añadir"}
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Enlace público
// ===========================================================================

function PublicLinkSection({
  companyId,
  invitation,
  filersCount,
  onChanged,
}: {
  companyId: string;
  invitation: RentaInvitation | null;
  filersCount: number;
  onChanged: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSending, startSendTransition] = useTransition();

  const publicUrl = useMemo(() => {
    if (!invitation) return null;
    const base =
      typeof window !== "undefined"
        ? window.location.origin.replace("admin.", "app.")
        : "https://app.leanfinance.es";
    return `${base}/renta/${invitation.token}`;
  }, [invitation]);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await ensureRentaInvitation(companyId);
      if (!res.ok) setError(res.error);
      await onChanged();
    });
  }

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const res = await revokeRentaInvitation(companyId);
      if (!res.ok) setError(res.error);
      await onChanged();
      setConfirmRevoke(false);
    });
  }

  function handleCopy() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleSendEmail() {
    setError(null);
    setInfo(null);
    startSendTransition(async () => {
      const res = await sendRentaInvitationEmail(companyId);
      if (!res.ok) {
        setError(res.error);
      } else {
        setInfo("Email enviado a las cuentas asociadas de la empresa.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {filersCount === 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          Añade al menos un DNI autorizado en la pestaña anterior antes de compartir el enlace.
        </div>
      )}

      {!invitation ? (
        <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-text-muted">
            Todavía no hay enlace público. Genera uno para empezar a recibir declaraciones.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            className="text-xs font-medium px-3 py-1.5 rounded bg-brand-teal text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Generando…" : "Generar enlace"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-text-muted">Enlace público</span>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={publicUrl ?? ""}
                className="flex-1 text-xs font-mono px-2 py-1.5 border border-gray-200 rounded bg-white"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
              >
                {copied ? "¡Copiado!" : "Copiar"}
              </button>
            </div>
            <span className="text-[11px] text-text-muted/80">
              Expira el {new Date(invitation.expires_at).toLocaleDateString("es-ES")}
            </span>
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={isSending || filersCount === 0}
              className="text-xs font-medium px-3 py-1.5 rounded bg-brand-navy text-white hover:opacity-90 disabled:opacity-50"
            >
              {isSending ? "Enviando…" : "Enviar por email a cuentas asociadas"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRevoke(true)}
              className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
            >
              Revocar enlace
            </button>
          </div>
        </div>
      )}

      {info && <p className="text-xs text-emerald-700">{info}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {confirmRevoke && (
        <ConfirmDialog
          title="Revocar enlace público"
          message="El enlace dejará de funcionar inmediatamente. Las submissions existentes se mantienen. Tendrás que generar uno nuevo para futuros familiares."
          confirmLabel="Revocar"
          destructive
          onConfirm={async () => handleRevoke()}
          onCancel={() => setConfirmRevoke(false)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Envíos recibidos
// ===========================================================================

function SubmissionsSection({
  submissions,
  deductionsCatalog,
  onChanged,
}: {
  submissions: RentaSubmission[];
  deductionsCatalog: RentaDeduction[];
  onChanged: () => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const catalogIndex = useMemo(() => {
    const map = new Map<string, RentaDeduction>();
    for (const d of deductionsCatalog) map.set(d.id, d);
    return map;
  }, [deductionsCatalog]);

  if (submissions.length === 0) {
    return (
      <p className="text-xs text-text-muted italic py-3">
        Todavía no se ha recibido ninguna declaración.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {submissions.map((s) => (
        <SubmissionCard
          key={s.id}
          submission={s}
          deductionsIndex={catalogIndex}
          expanded={expandedId === s.id}
          onToggle={() => setExpandedId((id) => (id === s.id ? null : s.id))}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function SubmissionCard({
  submission,
  deductionsIndex,
  expanded,
  onToggle,
  onChanged,
}: {
  submission: RentaSubmission;
  deductionsIndex: Map<string, RentaDeduction>;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [notes, setNotes] = useState(submission.admin_notes ?? "");
  const [isPending, startTransition] = useTransition();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const isRevoked = submission.revoked_at != null;
  const isReviewed = submission.status === "revisada";

  function toggleStatus() {
    startTransition(async () => {
      await setSubmissionStatus(submission.id, isReviewed ? "pendiente" : "revisada");
      await onChanged();
    });
  }

  function saveNotes() {
    startTransition(async () => {
      await updateSubmissionNotes(submission.id, notes);
      await onChanged();
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      await revokeSubmission(submission.id);
      await onChanged();
      setConfirmRevoke(false);
    });
  }

  const ccaaLabel = CCAA_LABELS[submission.profile_response.ccaa as CCAACode] ?? submission.profile_response.ccaa;

  const badgeClass = isRevoked
    ? "inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 line-through"
    : isReviewed
      ? "inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700"
      : "inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700";
  const badgeLabel = isRevoked ? "Revocada" : isReviewed ? "Revisada" : "Pendiente";

  return (
    <div className={isRevoked ? "border border-gray-100 rounded-lg opacity-70" : "border border-gray-100 rounded-lg"}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={badgeClass}>{badgeLabel}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-navy truncate">{submission.full_name}</p>
            <p className="text-[11px] text-text-muted font-mono">
              {submission.dni} · {ccaaLabel} · {new Date(submission.created_at).toLocaleDateString("es-ES")}
            </p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-3">
          <SubmissionProfileDump profile={submission.profile_response} />
          <SubmissionDeductionsDump
            deductionsResponse={submission.deductions_response}
            deductionsIndex={deductionsIndex}
          />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-text-muted">Notas internas</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Observaciones del asesor sobre esta declaración…"
              className="text-xs px-2 py-1.5 border border-gray-200 rounded resize-none"
            />
          </label>
          {isRevoked && submission.revoked_at && (
            <div className="text-[11px] text-text-muted bg-gray-50 border border-gray-200 rounded p-2">
              Revocada el {new Date(submission.revoked_at).toLocaleDateString("es-ES")}.
              El familiar puede volver a rellenar el formulario con el mismo enlace y DNI.
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {!isRevoked && (
              <button
                type="button"
                onClick={() => setConfirmRevoke(true)}
                disabled={isPending}
                className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Revocar para que rellene otra vez
              </button>
            )}
            {!isRevoked && (
              <button
                type="button"
                onClick={toggleStatus}
                disabled={isPending}
                className="text-xs font-medium px-3 py-1.5 rounded bg-brand-teal text-white hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? "Guardando…" : isReviewed ? "Marcar como pendiente" : "Marcar como revisada"}
              </button>
            )}
          </div>
        </div>
      )}

      {confirmRevoke && (
        <ConfirmDialog
          title="Revocar declaración"
          message={`Se descartará esta declaración de ${submission.full_name} y podrá volver a rellenarla con el mismo enlace y DNI. Los datos enviados se conservan como histórico pero no se mostrarán como activos. ¿Continuar?`}
          confirmLabel="Revocar"
          destructive
          onConfirm={async () => handleRevoke()}
          onCancel={() => setConfirmRevoke(false)}
        />
      )}
    </div>
  );
}

function SubmissionProfileDump({ profile }: { profile: RentaSubmission["profile_response"] }) {
  const entries: [string, string][] = [
    ["CCAA", CCAA_LABELS[profile.ccaa as CCAACode] ?? profile.ccaa],
    ["Municipio", profile.municipality ?? "—"],
    ["Pueblo despoblado", profile.small_municipality ? "Sí" : "No"],
    ["Fecha nacimiento", profile.birth_date],
    ["Discapacidad", `${profile.disability_pct}%`],
    ["Estado civil", profile.civil_status],
    ["Modalidad", profile.declaration_mode ?? "—"],
    ["Monoparental", profile.monoparental ? "Sí" : "No"],
    ["Familia numerosa", profile.large_family ?? "—"],
    ["Vivienda", describeHousing(profile.housing)],
    ["Hijos", profile.kids?.length ? `${profile.kids.length} (${profile.kids.map((k) => k.birth_date).join(", ")})` : "—"],
    ["Base liquidable estimada", profile.income_base != null ? `${profile.income_base.toLocaleString("es-ES")} €` : "—"],
  ];
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
        Perfil
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="text-text-muted shrink-0">{k}:</dt>
            <dd className="text-brand-navy truncate">{v}</dd>
          </div>
        ))}
      </dl>
      {profile.notes && (
        <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs">
          <span className="font-medium">Notas del familiar: </span>
          {profile.notes}
        </div>
      )}
    </div>
  );
}

function describeHousing(h: RentaSubmission["profile_response"]["housing"]): string {
  if (!h) return "—";
  if (h.type === "alquiler") return `Alquiler · ${h.monthly_rent_eur ?? "?"} €/mes · desde ${h.start_date ?? "?"}`;
  if (h.type === "propiedad")
    return `Propiedad · ${h.is_habitual ? "habitual" : "no habitual"}${h.acquisition_date ? ` · adquirida ${h.acquisition_date}` : ""}`;
  return "Otro";
}

function SubmissionDeductionsDump({
  deductionsResponse,
  deductionsIndex,
}: {
  deductionsResponse: Record<string, Record<string, unknown>>;
  deductionsIndex: Map<string, RentaDeduction>;
}) {
  const entries = Object.entries(deductionsResponse ?? {});
  if (entries.length === 0) {
    return (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
          Deducciones aplicables
        </p>
        <p className="text-xs text-text-muted italic">
          El contribuyente no marcó ninguna deducción aplicable.
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
        Deducciones aplicables ({entries.length})
      </p>
      <ul className="space-y-2">
        {entries.map(([deductionId, payload]) => {
          const def = deductionsIndex.get(deductionId);
          const fieldsByKey = new Map<string, RentaExtraField>();
          if (def) for (const f of def.extra_fields ?? []) fieldsByKey.set(f.key, f);

          const payloadEntries = Object.entries(payload ?? {});

          return (
            <li
              key={deductionId}
              className="rounded-lg border border-gray-100 bg-white p-3"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <p className="text-xs font-medium text-brand-navy leading-snug">
                  {def?.title ?? deductionId}
                </p>
                <code className="text-[10px] font-mono text-text-muted/70 shrink-0">
                  {deductionId}
                </code>
              </div>
              {def?.summary && (
                <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
                  {def.summary}
                </p>
              )}
              {payloadEntries.length > 0 && (
                <dl
                  className={
                    "mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]" +
                    (def?.summary ? " pt-2 border-t border-gray-50" : "")
                  }
                >
                  {payloadEntries.map(([k, v]) => {
                    const field = fieldsByKey.get(k);
                    const label = field?.label ?? k;
                    return (
                      <div key={k} className="flex flex-col gap-0.5 min-w-0">
                        <dt className="text-text-muted truncate">{label}</dt>
                        <dd className="text-brand-navy font-medium break-words">
                          {formatExtraFieldValue(v, field, label)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Formatea el valor de un extra_field para mostrarlo en el panel admin.
 * - boolean → "Sí" / "No"
 * - number → toLocaleString("es-ES") (miles + decimal coma); añade " €" si el
 *   label sugiere euros ("€", "eur", "euros") — case-insensitive.
 * - select → resuelve a `label` de la opción si existe.
 * - resto → String(v) con "—" si vacío/null/undefined.
 */
function formatExtraFieldValue(
  value: unknown,
  field: RentaExtraField | undefined,
  label: string,
): string {
  if (value === null || value === undefined || value === "") return "—";

  const labelSuggestsEuro = /€|eur(o|os)?\b/i.test(label) || /€|eur(o|os)?\b/i.test(field?.key ?? "");

  if (typeof value === "boolean" || field?.kind === "boolean") {
    return value ? "Sí" : "No";
  }

  if (field?.kind === "number" || typeof value === "number") {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isNaN(num)) {
      const formatted = num.toLocaleString("es-ES", {
        maximumFractionDigits: 2,
      });
      return labelSuggestsEuro ? `${formatted} €` : formatted;
    }
  }

  if (field?.kind === "select" && field.options) {
    const opt = field.options.find((o) => o.value === value);
    if (opt) return opt.label;
  }

  return String(value);
}
