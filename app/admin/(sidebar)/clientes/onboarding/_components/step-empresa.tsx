"use client";

import { useEffect, useState } from "react";
import type {
  OnboardingState,
  OnboardingClientAccountState,
  OnboardingBankAccountState,
} from "./onboarding-state";
import { genId } from "./onboarding-state";
import { lookupExistingClientByEmail } from "../actions";

interface Props {
  state: OnboardingState;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  canManageBankAccounts: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function StepEmpresa({ state, setState, canManageBankAccounts }: Props) {
  function patch<K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  const [showAddAccount, setShowAddAccount] = useState(false);

  function addBank() {
    setState((prev) => ({
      ...prev,
      bank_accounts: [
        ...prev.bank_accounts,
        { id: genId(), iban: "", label: "", bank_name: "" },
      ],
    }));
  }
  function updateBank(id: string, patch: Partial<OnboardingBankAccountState>) {
    setState((prev) => ({
      ...prev,
      bank_accounts: prev.bank_accounts.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }
  function removeBank(id: string) {
    setState((prev) => ({
      ...prev,
      bank_accounts: prev.bank_accounts.filter((b) => b.id !== id),
    }));
  }

  function addClientAccount(account: OnboardingClientAccountState) {
    setState((prev) => ({
      ...prev,
      client_accounts: [...prev.client_accounts, account],
    }));
    setShowAddAccount(false);
  }
  function removeClient(id: string) {
    setState((prev) => ({
      ...prev,
      client_accounts: prev.client_accounts.filter((c) => c.id !== id),
    }));
  }

  return (
    <div className="space-y-8">
      {/* Datos básicos */}
      <section>
        <SectionHeader
          title="Datos de la empresa"
          subtitle="Razón social, nombre comercial y NIF/CIF son obligatorios."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Razón social" required>
            <input
              type="text"
              value={state.legal_name}
              onChange={(e) => patch("legal_name", e.target.value)}
              required
              autoFocus
              placeholder="Ej: Acme Servicios SL"
              className={inputCls}
            />
          </Field>
          <Field label="Nombre comercial" required>
            <input
              type="text"
              value={state.company_name}
              onChange={(e) => patch("company_name", e.target.value)}
              required
              placeholder="Ej: Acme"
              className={inputCls}
            />
          </Field>
          <Field label="NIF / CIF" required>
            <input
              type="text"
              value={state.nif}
              onChange={(e) => patch("nif", e.target.value.toUpperCase())}
              required
              placeholder="Ej: B12345678"
              className={`${inputCls} font-mono`}
            />
          </Field>
        </div>
      </section>

      {/* Cuentas bancarias — solo si el usuario tiene manage_bank_accounts */}
      {canManageBankAccounts && (
        <section>
          <SectionHeader
            title="Cuentas bancarias"
            subtitle="Opcional. La primera cuenta queda marcada como predeterminada."
          />
          <div className="space-y-3">
            {state.bank_accounts.map((b, idx) => (
              <div
                key={b.id}
                className="bg-gray-50 rounded-xl p-4 space-y-3 relative"
              >
                <button
                  type="button"
                  onClick={() => removeBank(b.id)}
                  className="absolute top-2 right-2 text-text-muted hover:text-red-500 cursor-pointer w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-red-50"
                  aria-label="Eliminar cuenta bancaria"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Field label="IBAN" required>
                      <input
                        type="text"
                        value={b.iban}
                        onChange={(e) => updateBank(b.id, { iban: e.target.value.toUpperCase() })}
                        placeholder="Ej: ES12 3456 7890 1234 5678 9012"
                        className={`${inputCls} font-mono`}
                      />
                    </Field>
                    {idx === 0 && (
                      <p className="mt-1 text-[11px] text-text-muted/80">
                        Cuenta predeterminada
                      </p>
                    )}
                  </div>
                  <Field label="Banco">
                    <input
                      type="text"
                      value={b.bank_name}
                      onChange={(e) => updateBank(b.id, { bank_name: e.target.value })}
                      placeholder="Ej: BBVA"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Etiqueta">
                    <input
                      type="text"
                      value={b.label}
                      onChange={(e) => updateBank(b.id, { label: e.target.value })}
                      placeholder="Ej: Operativa, Nóminas..."
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addBank}
              className="text-xs text-brand-teal hover:text-brand-teal/80 px-3 py-2 rounded-lg border border-dashed border-brand-teal/40 hover:border-brand-teal/60 cursor-pointer"
            >
              + Añadir cuenta bancaria
            </button>
          </div>
        </section>
      )}

      {/* Cuentas asociadas */}
      <section>
        <SectionHeader
          title="Cuentas asociadas"
          subtitle="Usuarios que accederán al portal del cliente. Al menos una es obligatoria."
        />
        <div className="space-y-2">
          {state.client_accounts.length === 0 && !showAddAccount && (
            <p className="text-xs text-text-muted/80 italic">Sin cuentas asociadas todavía.</p>
          )}
          {state.client_accounts.map((c) => (
            <ClientAccountRow
              key={c.id}
              account={c}
              onRemove={() => removeClient(c.id)}
            />
          ))}
          {showAddAccount ? (
            <AddClientAccountForm
              existingEmails={state.client_accounts.map((c) =>
                c.email.trim().toLowerCase()
              )}
              onCancel={() => setShowAddAccount(false)}
              onAdd={addClientAccount}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddAccount(true)}
              className="text-xs text-brand-teal hover:text-brand-teal/80 px-3 py-2 rounded-lg border border-dashed border-brand-teal/40 hover:border-brand-teal/60 cursor-pointer"
            >
              + Añadir cuenta asociada
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-componentes locales
// ─────────────────────────────────────────────────────────────────────────

function ClientAccountRow({
  account,
  onRemove,
}: {
  account: OnboardingClientAccountState;
  onRemove: () => void;
}) {
  const isExisting = !!account.existing_profile_id;
  const display = account.full_name?.trim() || (isExisting ? "(sin nombre)" : "");
  const linkedWarn = account.already_linked_warning ?? [];
  return (
    <div
      className={`rounded-xl p-3 flex items-center justify-between gap-3 ${
        isExisting ? "bg-brand-teal/5 border border-brand-teal/30" : "bg-gray-50"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isExisting ? "bg-brand-teal/10" : "bg-gray-200"
          }`}
        >
          <svg
            className={`w-4 h-4 ${isExisting ? "text-brand-teal" : "text-text-muted"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-body truncate">
            {display || account.email}
          </p>
          {display && (
            <p className="text-xs text-text-muted truncate">{account.email}</p>
          )}
          {isExisting && (
            <p className="text-[11px] text-brand-teal mt-0.5">
              Cuenta existente — se vinculará a esta empresa
            </p>
          )}
          {linkedWarn.length > 0 && (
            <p className="text-[11px] text-amber-700 mt-0.5">
              Ya vinculada a: {linkedWarn.map((l) => l.legal_name).join(", ")}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-text-muted hover:text-red-500 hover:bg-red-50 cursor-pointer w-8 h-8 inline-flex items-center justify-center rounded-md flex-shrink-0"
        aria-label="Quitar cuenta asociada"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function AddClientAccountForm({
  existingEmails,
  onAdd,
  onCancel,
}: {
  existingEmails: string[];
  onAdd: (account: OnboardingClientAccountState) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{
    profile_id: string;
    full_name: string | null;
    alreadyLinkedTo: { id: string; legal_name: string }[];
  } | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  // Búsqueda con debounce
  useEffect(() => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setFound(null);
      setSearched(false);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setError("");
    const handle = setTimeout(async () => {
      try {
        const result = await lookupExistingClientByEmail(clean);
        if (!cancelled) {
          if (!result || !result.exists || !result.profile_id) {
            setFound(null);
          } else {
            setFound({
              profile_id: result.profile_id,
              full_name: result.full_name,
              alreadyLinkedTo: result.alreadyLinkedTo,
            });
          }
          setSearched(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error en la búsqueda");
          setFound(null);
          setSearched(false);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [email]);

  const cleanEmail = email.trim().toLowerCase();
  const duplicateInWizard = existingEmails.includes(cleanEmail);
  const canSubmit =
    EMAIL_RE.test(cleanEmail) &&
    !duplicateInWizard &&
    (found !== null || fullName.trim().length > 0);

  function handleAdd() {
    if (!canSubmit) return;
    onAdd({
      id: genId(),
      email: cleanEmail,
      full_name: found ? found.full_name ?? "" : fullName.trim(),
      existing_profile_id: found?.profile_id ?? null,
      already_linked_warning: found?.alreadyLinkedTo,
    });
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
      <Field label="Email" required>
        <div className="relative">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Ej: cliente@empresa.com"
            autoFocus
            className={`${inputCls} pr-9`}
          />
          {searching && (
            <svg
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
            </svg>
          )}
        </div>
      </Field>

      {duplicateInWizard && (
        <p className="text-xs text-amber-700">
          Esta cuenta ya está añadida a este onboarding.
        </p>
      )}

      {searched && found && (
        <div className="flex items-center gap-3 bg-brand-teal/5 border border-brand-teal/30 rounded-lg px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-brand-teal"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-text-muted">
              Cliente existente — se vinculará a esta empresa
            </p>
            <p className="text-sm font-medium text-text-body truncate">
              {found.full_name?.trim() || "Sin nombre"}
            </p>
            {found.alreadyLinkedTo.length > 0 && (
              <p className="text-[11px] text-amber-700 mt-0.5">
                Actualmente vinculada a:{" "}
                {found.alreadyLinkedTo.map((l) => l.legal_name).join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {searched && !found && (
        <div>
          <Field label="Nombre" required>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej: María García"
              className={inputCls}
            />
          </Field>
          <p className="text-[11px] text-text-muted mt-1">
            No existe ningún cliente con este email — se creará una cuenta nueva.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-text-muted hover:text-text-body px-3 py-1.5 rounded-lg cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleAdd}
          className="text-xs bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer"
        >
          {found ? "Añadir y vincular" : "Añadir cuenta"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
      {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
    </div>
  );
}
