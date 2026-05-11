"use client";

import { useState } from "react";

interface EnisaStoredView {
  user: string;
  // Indicador de que existe una contraseña cifrada en BD. NUNCA se manda al
  // cliente; el admin la descifra bajo demanda con onRevealPassword.
  has_password: boolean;
}

interface Props {
  mode: "client" | "admin";
  // Si false, el formulario se muestra deshabilitado (solo lectura).
  canEdit: boolean;
  stored: EnisaStoredView | null;
  onSubmit?: (input: { user: string; password: string }) => Promise<void>;
  // Admin: descifrar la contraseña on-demand. Para cliente nunca se pasa.
  onRevealPassword?: () => Promise<string>;
}

export default function EnisaForm({
  mode,
  canEdit,
  stored,
  onSubmit,
  onRevealPassword,
}: Props) {
  // Si no hay credenciales todavía → empezamos en modo edición. Si ya las hay
  // → resumen compacto + botón Editar.
  const [editing, setEditing] = useState(stored === null);

  const isAdmin = mode === "admin";

  if (!editing && stored) {
    return (
      <SummaryView
        stored={stored}
        canEdit={canEdit && !!onSubmit}
        isAdmin={isAdmin}
        onRevealPassword={onRevealPassword}
        onEdit={() => setEditing(true)}
      />
    );
  }

  return (
    <EditView
      stored={stored}
      canEdit={canEdit}
      hasStored={stored !== null}
      onSubmit={onSubmit}
      onCancel={stored ? () => setEditing(false) : undefined}
      onSaved={() => setEditing(false)}
    />
  );
}

// ─── Resumen (modo lectura, post-guardado) ──────────────────────────────────

function SummaryView({
  stored,
  canEdit,
  isAdmin,
  onRevealPassword,
  onEdit,
}: {
  stored: EnisaStoredView;
  canEdit: boolean;
  isAdmin: boolean;
  onRevealPassword?: () => Promise<string>;
  onEdit: () => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleReveal() {
    if (!onRevealPassword) return;
    setError(null);
    setRevealing(true);
    try {
      const pw = await onRevealPassword();
      setRevealed(pw);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al descifrar");
    } finally {
      setRevealing(false);
    }
  }

  async function handleCopy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
          Credenciales ENISA
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-medium text-brand-teal hover:bg-brand-teal/10 bg-brand-teal/5 px-2.5 py-1 rounded-lg cursor-pointer inline-flex items-center gap-1"
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Editar credenciales
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider w-24 shrink-0">
            Usuario
          </span>
          <code className="text-sm text-text-body select-all">{stored.user}</code>
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider w-24 shrink-0">
            Contraseña
          </span>
          {revealed ? (
            <code className="text-sm text-text-body select-all">{revealed}</code>
          ) : (
            <code className="text-sm text-text-muted tracking-wider">••••••••••</code>
          )}
          {isAdmin && stored.has_password && onRevealPassword && (
            <div className="ml-auto flex items-center gap-1">
              {!revealed ? (
                <button
                  type="button"
                  onClick={handleReveal}
                  disabled={revealing}
                  className="text-xs font-medium text-brand-teal hover:bg-brand-teal/10 bg-brand-teal/5 px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-40"
                >
                  {revealing ? "Descifrando…" : "Mostrar"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-xs font-medium text-brand-navy hover:bg-brand-navy/10 bg-brand-navy/5 px-2.5 py-1 rounded-lg cursor-pointer"
                  >
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRevealed(null)}
                    className="text-xs text-text-muted hover:text-brand-navy px-2.5 py-1 rounded-lg cursor-pointer"
                  >
                    Ocultar
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </section>
  );
}

// ─── Edición (form) ──────────────────────────────────────────────────────────

function EditView({
  stored,
  canEdit,
  hasStored,
  onSubmit,
  onCancel,
  onSaved,
}: {
  stored: EnisaStoredView | null;
  canEdit: boolean;
  hasStored: boolean;
  onSubmit?: (input: { user: string; password: string }) => Promise<void>;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const [user, setUser] = useState(stored?.user ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = !canEdit || submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmit) return;
    setError(null);
    if (!user.trim()) {
      setError("Indica el usuario");
      return;
    }
    if (!password && !stored?.has_password) {
      setError("Indica la contraseña");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ user: user.trim(), password });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">
        Credenciales ENISA
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="enisa-user"
            className="block text-xs font-medium text-text-body mb-1"
          >
            Usuario <span className="text-red-500">*</span>
          </label>
          <input
            id="enisa-user"
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            disabled={disabled}
            autoComplete="off"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-teal disabled:bg-gray-50 disabled:text-text-muted"
            placeholder="usuario@empresa.com"
          />
        </div>
        <div>
          <label
            htmlFor="enisa-password"
            className="block text-xs font-medium text-text-body mb-1"
          >
            {hasStored ? "Nueva contraseña" : "Contraseña"}{" "}
            {!hasStored && <span className="text-red-500">*</span>}
          </label>
          <div className="relative">
            <input
              id="enisa-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={disabled}
              autoComplete="new-password"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-10 bg-white focus:outline-none focus:border-brand-teal disabled:bg-gray-50 disabled:text-text-muted"
              placeholder={
                hasStored
                  ? "Déjala vacía para conservar la actual"
                  : "Escribe la contraseña"
              }
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={disabled}
              tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-brand-navy disabled:opacity-30 cursor-pointer"
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
            >
              {showPassword ? (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {canEdit && onSubmit && (
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="text-sm font-semibold text-white px-4 py-2 rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2 bg-brand-teal"
            >
              {submitting ? "Guardando…" : "Guardar"}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="text-sm font-medium text-text-muted hover:text-brand-navy px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
