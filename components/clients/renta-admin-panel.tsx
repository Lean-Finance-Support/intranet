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
  setConfirmedDeductions,
} from "@/app/admin/clientes/[id]/renta-actions";
import ConfirmDialog from "@/components/confirm-dialog";
import { DeductionCollapsible } from "@/components/renta/deduction-collapsible";
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

  if (loading) {
    return (
      <div className="space-y-5">
        <SectionCardSkeleton />
        <SectionCardSkeleton />
        <SectionCardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard
        step={1}
        title="DNIs autorizados"
        description="Solo los familiares con uno de estos DNIs podrán entrar al formulario público."
        badge={`${filers.length} ${filers.length === 1 ? "DNI" : "DNIs"}`}
      >
        <AuthorizedFilersSection
          companyId={companyId}
          filers={filers}
          onChanged={refresh}
        />
      </SectionCard>

      <SectionCard
        step={2}
        title="Enlace público"
        description="Comparte este enlace con los familiares para que rellenen el formulario."
        badge={invitation ? "Activo" : "Inactivo"}
        badgeTone={invitation ? "teal" : "muted"}
      >
        <PublicLinkSection
          companyId={companyId}
          invitation={invitation}
          filersCount={filers.length}
          onChanged={refresh}
        />
      </SectionCard>

      <SectionCard
        step={3}
        title="Envíos recibidos"
        description="Revisa las declaraciones enviadas por los familiares y marca las que ya hayas tratado."
        badge={`${submissions.length} ${submissions.length === 1 ? "envío" : "envíos"}`}
      >
        <SubmissionsSection
          submissions={submissions}
          deductionsCatalog={deductions}
          onChanged={refresh}
        />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// SectionCard — shell visual para cada uno de los 3 bloques
// ===========================================================================

function SectionCard({
  step,
  title,
  description,
  badge,
  badgeTone = "navy",
  children,
}: {
  step: number;
  title: string;
  description: string;
  badge?: string;
  badgeTone?: "navy" | "teal" | "muted";
  children: React.ReactNode;
}) {
  const badgeClass = {
    navy: "bg-brand-navy/5 text-brand-navy border-brand-navy/10",
    teal: "bg-brand-teal/10 text-brand-teal border-brand-teal/20",
    muted: "bg-gray-50 text-text-muted border-gray-200",
  }[badgeTone];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50/30">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-navy text-white text-xs font-semibold"
          >
            {step}
          </span>
          <div>
            <h2 className="text-base font-semibold text-brand-navy">{title}</h2>
            <p className="text-xs text-text-muted mt-0.5 leading-relaxed max-w-xl">
              {description}
            </p>
          </div>
        </div>
        {badge && (
          <span
            className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${badgeClass}`}
          >
            {badge}
          </span>
        )}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function SectionCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50/30">
        <div className="h-5 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-72 bg-gray-100 rounded animate-pulse mt-2" />
      </div>
      <div className="px-6 py-6">
        <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
        <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse mt-3" />
      </div>
    </div>
  );
}

// ===========================================================================
// Empty state genérico
// ===========================================================================

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/40">
      <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center text-text-muted mb-3">
        {icon}
      </div>
      <p className="text-sm font-medium text-brand-navy">{title}</p>
      <p className="text-xs text-text-muted mt-1 max-w-sm leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
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

  const addButton = (
    <button
      type="button"
      onClick={() => {
        setShowForm(true);
        setEditingId(null);
      }}
      className="inline-flex items-center gap-1.5 text-sm font-medium bg-brand-teal text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      Añadir DNI
    </button>
  );

  return (
    <div className="space-y-4">
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
        <EmptyState
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
          title="Sin DNIs autorizados todavía"
          description="Añade al menos un DNI antes de compartir el enlace público. Sin autorización, el formulario rechazará a quien intente entrar."
          action={!showForm ? addButton : undefined}
        />
      ) : (
        <>
          <div className="flex justify-end">{addButton}</div>
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider">DNI</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Email</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filers.map((f) =>
                  editingId === f.id ? (
                    <tr key={f.id}>
                      <td colSpan={5} className="p-4 bg-brand-teal/[0.03]">
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
                    <tr key={f.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-brand-navy text-sm">{f.dni}</td>
                      <td className="px-4 py-3 text-brand-navy">{f.full_name}</td>
                      <td className="px-4 py-3 text-text-muted">{f.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        {f.has_submission ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Enviado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(f.id);
                            setShowForm(false);
                          }}
                          className="text-sm text-brand-navy hover:text-brand-teal font-medium"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(f)}
                          className="ml-4 text-sm text-red-600 hover:text-red-700 font-medium"
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
        </>
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
    <div className="space-y-3 border border-brand-teal/30 rounded-xl p-4 bg-brand-teal/5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">DNI / NIE</span>
          <input
            type="text"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            disabled={isEdit}
            placeholder="12345678Z"
            className="text-sm font-mono px-3 py-2 border border-gray-200 rounded-lg disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">Nombre completo</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nombre y apellidos"
            className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">Email (opcional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="familiar@ejemplo.com"
            className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">Notas internas (opcional)</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Relación, observaciones…"
            className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm px-4 py-2 rounded-lg hover:bg-white text-text-muted"
          disabled={isPending}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
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
    <div className="space-y-4">
      {filersCount === 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Añade al menos un DNI autorizado antes de compartir el enlace.</span>
        </div>
      )}

      {!invitation ? (
        <EmptyState
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          }
          title="Sin enlace público activo"
          description="Genera un enlace para empezar a recibir declaraciones de los familiares."
          action={
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isPending}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isPending ? "Generando…" : "Generar enlace"}
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-muted">Enlace público</span>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={publicUrl ?? ""}
                  className="flex-1 text-sm font-mono px-3 py-2 border border-gray-200 rounded-lg bg-gray-50/50 text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  {copied ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
            </label>
            <p className="text-xs text-text-muted/80 mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Expira el {new Date(invitation.expires_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={isSending || filersCount === 0}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-brand-navy text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {isSending ? "Enviando…" : "Enviar por email a cuentas asociadas"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRevoke(true)}
              className="text-sm px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              Revocar enlace
            </button>
          </div>
        </div>
      )}

      {info && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{info}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

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

  if (submissions.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        }
        title="Sin envíos todavía"
        description="Cuando los familiares rellenen el formulario público, sus declaraciones aparecerán aquí para que las revises."
      />
    );
  }
  return (
    <div className="space-y-2">
      {submissions.map((s) => (
        <SubmissionCard
          key={s.id}
          submission={s}
          deductionsCatalog={deductionsCatalog}
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
  deductionsCatalog,
  expanded,
  onToggle,
  onChanged,
}: {
  submission: RentaSubmission;
  deductionsCatalog: RentaDeduction[];
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
    ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 line-through border border-gray-200"
    : isReviewed
      ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100"
      : "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100";
  const badgeLabel = isRevoked ? "Revocada" : isReviewed ? "Revisada" : "Pendiente";
  const badgeDot = isRevoked ? "bg-gray-400" : isReviewed ? "bg-emerald-500" : "bg-amber-500";

  return (
    <div className={`border rounded-xl transition-all ${isRevoked ? "border-gray-100 opacity-70" : "border-gray-100 hover:border-gray-200"}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50/50 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={badgeClass}>
            <span className={`w-1.5 h-1.5 rounded-full ${badgeDot}`} />
            {badgeLabel}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-navy truncate">{submission.full_name}</p>
            <p className="text-xs text-text-muted font-mono mt-0.5">
              {submission.dni} · {ccaaLabel} · {new Date(submission.created_at).toLocaleDateString("es-ES")}
            </p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-text-muted transition-transform flex-shrink-0 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-4">
          <SubmissionProfileDump profile={submission.profile_response} />
          <ConfirmedDeductionsEditor
            submission={submission}
            deductionsCatalog={deductionsCatalog}
            locked={isReviewed}
            onChanged={onChanged}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted">Notas internas</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Observaciones del asesor sobre esta declaración…"
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
            />
          </label>
          {isRevoked && submission.revoked_at && (
            <div className="text-xs text-text-muted bg-gray-50 border border-gray-200 rounded-lg p-3">
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
                className="text-sm px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Revocar para que rellene otra vez
              </button>
            )}
            {!isRevoked && (
              <button
                type="button"
                onClick={toggleStatus}
                disabled={isPending}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
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
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
        Perfil
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="text-text-muted shrink-0">{k}:</dt>
            <dd className="text-brand-navy truncate font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {profile.notes && (
        <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
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

/**
 * Editor de las deducciones confirmadas por el asesor.
 *
 * El asesor produce aquí `confirmed_deductions`: la lista definitiva de
 * deducciones a las que el cliente tiene derecho, visible para el cliente
 * cuando la submission pasa a 'revisada'. Cada acción se guarda al instante
 * y la lista se puede seguir editando también después de marcar el envío
 * como revisado.
 *
 * Dos listas + buscador:
 *   1. Confirmadas — cada una con su botón "Quitar".
 *   2. Las marcadas "No estoy seguro" sin decidir — con "Sí, le corresponde" /
 *      "No le corresponde".
 *   + Un buscador del catálogo de la CCAA para añadir cualquier otra.
 */
function ConfirmedDeductionsEditor({
  submission,
  deductionsCatalog,
  locked,
  onChanged,
}: {
  submission: RentaSubmission;
  deductionsCatalog: RentaDeduction[];
  /** Envío ya revisado → la lista se muestra en solo lectura. */
  locked: boolean;
  onChanged: () => Promise<void>;
}) {
  const ccaa = submission.profile_response.ccaa as CCAACode;
  const appliedResponse = useMemo(
    () => submission.deductions_response ?? {},
    [submission.deductions_response],
  );
  const uncertainIds = useMemo(
    () => submission.uncertain_deductions ?? [],
    [submission.uncertain_deductions],
  );
  const catalogIndex = useMemo(() => {
    const m = new Map<string, RentaDeduction>();
    for (const d of deductionsCatalog) m.set(d.id, d);
    return m;
  }, [deductionsCatalog]);
  const ccaaActive = useMemo(
    () =>
      deductionsCatalog
        .filter((d) => d.ccaa_code === ccaa && d.is_active)
        .sort((a, b) => a.display_order - b.display_order),
    [deductionsCatalog, ccaa],
  );

  // `confirmed` es estado local optimista; se persiste en cada cambio.
  const [confirmed, setConfirmed] = useState<string[]>(
    () => submission.confirmed_deductions ?? [],
  );
  // Dudosas que el asesor ha marcado "No le corresponde" en esta sesión.
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const confirmedSet = useMemo(() => new Set(confirmed), [confirmed]);

  function persist(next: string[]) {
    const prev = confirmed;
    setConfirmed(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setConfirmedDeductions(submission.id, next);
      if (!res.ok) {
        setConfirmed(prev);
        setError("No se pudo guardar el cambio. Inténtalo de nuevo.");
        return;
      }
      setSaved(true);
      await onChanged();
    });
  }

  function confirmDeduction(id: string) {
    setDiscarded((prev) => {
      if (!prev.has(id)) return prev;
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    if (!confirmedSet.has(id)) persist([...confirmed, id]);
  }
  function removeDeduction(id: string) {
    persist(confirmed.filter((x) => x !== id));
  }
  function discardDeduction(id: string) {
    setDiscarded((prev) => new Set(prev).add(id));
    if (confirmedSet.has(id)) persist(confirmed.filter((x) => x !== id));
  }

  // Listas derivadas.
  const confirmedDeductions = confirmed
    .map((id) => catalogIndex.get(id))
    .filter((d): d is RentaDeduction => d != null)
    .sort((a, b) => a.display_order - b.display_order);
  const pendingUncertain = uncertainIds
    .filter((id) => !confirmedSet.has(id) && !discarded.has(id))
    .map((id) => catalogIndex.get(id))
    .filter((d): d is RentaDeduction => d != null);
  const pendingUncertainSet = new Set(pendingUncertain.map((d) => d.id));
  const addable = ccaaActive.filter(
    (d) => !confirmedSet.has(d.id) && !pendingUncertainSet.has(d.id),
  );

  // Datos que aportó el contribuyente para una deducción que marcó "Sí".
  function payloadExtra(d: RentaDeduction): React.ReactNode {
    const payload = (appliedResponse[d.id] ?? {}) as Record<string, unknown>;
    const entries = Object.entries(payload);
    if (entries.length === 0) return undefined;
    const fieldsByKey = new Map<string, RentaExtraField>();
    for (const f of d.extra_fields ?? []) fieldsByKey.set(f.key, f);
    return (
      <div>
        <p className="text-[11px] uppercase tracking-wider font-semibold text-text-muted mb-1">
          Datos aportados por el contribuyente
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {entries.map(([k, v]) => {
            const field = fieldsByKey.get(k);
            const label = field?.label ?? k;
            return (
              <div key={k} className="flex flex-col gap-0.5 min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-text-muted/80 font-medium">
                  {label}
                </dt>
                <dd className="text-brand-navy font-medium break-words">
                  {formatExtraFieldValue(v, field, label)}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Deducciones confirmadas */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            Deducciones confirmadas ({confirmedDeductions.length})
          </p>
          {!locked && isPending ? (
            <span className="text-[11px] text-text-muted">Guardando…</span>
          ) : !locked && saved ? (
            <span className="text-[11px] font-medium text-emerald-600">Guardado ✓</span>
          ) : null}
        </div>
        {locked ? (
          <p className="text-xs text-text-muted bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">
            Este envío está revisado, así que las deducciones están bloqueadas. Para cambiarlas,
            márcalo como pendiente con el botón de abajo.
          </p>
        ) : (
          <p className="text-xs text-text-muted mb-3">
            Lista de deducciones a las que el cliente tiene derecho. La verá en su portal cuando
            marques el envío como revisado.
          </p>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
            {error}
          </p>
        )}

        {confirmedDeductions.length === 0 ? (
          <p className="text-sm text-text-muted italic">
            Todavía no has confirmado ninguna deducción.
          </p>
        ) : (
          <div className="space-y-2">
            {confirmedDeductions.map((d) => (
              <DeductionCollapsible
                key={d.id}
                title={d.title}
                whatCovers={d.what_covers}
                requirements={d.requirements}
                legalReference={d.legal_reference}
                extra={payloadExtra(d)}
                trailing={
                  locked ? undefined : (
                    <button
                      type="button"
                      onClick={() => removeDeduction(d.id)}
                      className="text-xs font-medium text-red-600 hover:bg-red-50 rounded-md px-2 py-1 shrink-0"
                    >
                      Quitar
                    </button>
                  )
                }
              />
            ))}
          </div>
        )}

        {!locked && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="text-sm font-medium text-brand-teal hover:underline"
            >
              {pickerOpen ? "Cerrar el catálogo" : "+ Añadir una deducción"}
            </button>
          </div>
        )}

        {!locked && pickerOpen && (
          <div className="mt-2 rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-brand-navy">
                Catálogo de {CCAA_LABELS[ccaa] ?? ccaa}
              </p>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-xs text-text-muted hover:text-brand-navy whitespace-nowrap"
              >
                Cerrar ✕
              </button>
            </div>
            {addable.length === 0 ? (
              <p className="text-xs text-text-muted italic">
                No quedan más deducciones en el catálogo de esta comunidad.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {addable.map((d) => (
                  <DeductionCollapsible
                    key={d.id}
                    title={d.title}
                    whatCovers={d.what_covers}
                    requirements={d.requirements}
                    legalReference={d.legal_reference}
                    trailing={
                      <button
                        type="button"
                        onClick={() => confirmDeduction(d.id)}
                        className="text-xs font-semibold text-brand-teal hover:bg-brand-teal/10 rounded-md px-2 py-1 shrink-0"
                      >
                        + Añadir
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dudas pendientes de decidir */}
      {!locked && pendingUncertain.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-1">
            El contribuyente no lo tenía claro ({pendingUncertain.length})
          </p>
          <p className="text-xs text-text-muted mb-3">
            Decide si cada una le corresponde. Las que confirmes pasan a la lista de arriba.
          </p>
          <div className="space-y-2">
            {pendingUncertain.map((d) => (
              <DeductionCollapsible
                key={d.id}
                title={d.title}
                whatCovers={d.what_covers}
                requirements={d.requirements}
                legalReference={d.legal_reference}
                footer={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => confirmDeduction(d.id)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-teal text-white hover:opacity-90"
                    >
                      Sí, le corresponde
                    </button>
                    <button
                      type="button"
                      onClick={() => discardDeduction(d.id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-text-muted hover:bg-gray-50"
                    >
                      No le corresponde
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        </div>
      )}
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
