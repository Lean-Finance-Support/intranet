"use client";

import { useMemo, useState, useTransition } from "react";
import { submitRenta, verifyDni } from "../actions";
import { evaluateRule } from "@/lib/renta/rule-engine";
import { PROFILE_QUESTIONS, PROFILE_SECTIONS } from "@/lib/renta/profile-schema";
import { isValidDni, normalizeDni } from "@/lib/renta/dni";
import { CCAA_LABELS, type CCAACode, type RentaDeduction, type RentaProfileResponse } from "@/lib/types/renta";

interface Props {
  token: string;
  companyId: string;
  invitationId: string;
  deductions: RentaDeduction[];
}

type Step = "dni" | "profile" | "deductions" | "review" | "done";

export default function RentaForm({ token, deductions }: Props) {
  const [step, setStep] = useState<Step>("dni");
  const [authorizedFilerId, setAuthorizedFilerId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [profile, setProfile] = useState<Partial<RentaProfileResponse>>({
    kids: [],
    disability_pct: 0,
  });
  const [deductionsResponse, setDeductionsResponse] = useState<Record<string, Record<string, unknown>>>({});

  const applicableDeductions = useMemo(() => {
    if (!profile.ccaa) return [];
    return deductions
      .filter((d) => d.ccaa_code === profile.ccaa)
      .filter((d) => evaluateRule(d.eligibility_rule, profile));
  }, [deductions, profile]);

  if (step === "dni") {
    return (
      <DniStep
        token={token}
        onVerified={(filerId, name) => {
          setAuthorizedFilerId(filerId);
          setFullName(name);
          setStep("profile");
        }}
      />
    );
  }

  if (step === "profile") {
    return (
      <ProfileStep
        fullName={fullName}
        profile={profile}
        onChange={setProfile}
        onBack={() => setStep("dni")}
        onNext={() => setStep("deductions")}
      />
    );
  }

  if (step === "deductions") {
    return (
      <DeductionsStep
        deductions={applicableDeductions}
        ccaa={profile.ccaa!}
        deductionsResponse={deductionsResponse}
        onChange={setDeductionsResponse}
        onBack={() => setStep("profile")}
        onNext={() => setStep("review")}
      />
    );
  }

  if (step === "review") {
    return (
      <ReviewStep
        token={token}
        authorizedFilerId={authorizedFilerId!}
        fullName={fullName}
        profile={profile as RentaProfileResponse}
        deductionsResponse={deductionsResponse}
        applicableDeductions={applicableDeductions}
        onBack={() => setStep("deductions")}
        onSubmitted={() => setStep("done")}
      />
    );
  }

  return <DoneStep fullName={fullName} />;
}

// ===========================================================================
// Step 1: DNI
// ===========================================================================

function DniStep({
  token,
  onVerified,
}: {
  token: string;
  onVerified: (filerId: string, fullName: string) => void;
}) {
  const [dni, setDni] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleVerify() {
    setError(null);
    if (!isValidDni(normalizeDni(dni))) {
      setError("Formato de DNI/NIE inválido. Revisa los dígitos y la letra.");
      return;
    }
    startTransition(async () => {
      const res = await verifyDni(token, dni);
      if (res.ok) {
        onVerified(res.authorized_filer_id, res.full_name);
        return;
      }
      const messages: Record<string, string> = {
        invalid_token: "Este enlace ya no es válido. Contacta con tu asesor.",
        invalid_dni: "DNI/NIE inválido.",
        not_authorized:
          "Este DNI no está autorizado a rellenar el formulario de esta empresa. Pídele a tu asesor de Lean Finance que te dé de alta.",
        already_submitted:
          "Ya hemos recibido tu declaración. Si necesitas corregir algo, contacta con tu asesor.",
        rate_limited: "Has hecho demasiados intentos. Espera un minuto y vuelve a probar.",
      };
      setError(messages[res.reason] ?? "Ha ocurrido un error. Inténtalo de nuevo más tarde.");
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-brand-navy">Formulario de la declaración de la renta</h1>
        <p className="text-sm text-text-muted mt-1">
          Antes de empezar, indica tu DNI o NIE para verificar que tu asesor te ha dado de alta.
        </p>
      </header>
      <label className="flex flex-col gap-1.5 max-w-sm">
        <span className="text-xs font-medium text-text-muted">DNI / NIE</span>
        <input
          type="text"
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          autoComplete="off"
          placeholder="12345678Z"
          className="text-base font-mono px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-teal"
        />
      </label>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={handleVerify}
        disabled={isPending || dni.length === 0}
        className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Verificando…" : "Continuar"}
      </button>
    </div>
  );
}

// ===========================================================================
// Step 2: Profile
// ===========================================================================

function ProfileStep({
  fullName,
  profile,
  onChange,
  onBack,
  onNext,
}: {
  fullName: string;
  profile: Partial<RentaProfileResponse>;
  onChange: (p: Partial<RentaProfileResponse>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function set<K extends keyof RentaProfileResponse>(key: K, value: RentaProfileResponse[K]) {
    onChange({ ...profile, [key]: value });
  }

  const housing = profile.housing;

  // Validación mínima para avanzar.
  const canAdvance =
    profile.ccaa && profile.birth_date && profile.civil_status && profile.disability_pct !== undefined && housing != null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-text-muted">Paso 2 de 4</p>
        <h1 className="text-xl font-semibold text-brand-navy mt-1">Tus datos</h1>
        <p className="text-sm text-text-muted mt-1">
          Hola <span className="font-medium text-brand-navy">{fullName}</span>. Completa los siguientes
          datos. Determinarán qué deducciones de tu comunidad autónoma podemos aplicarte.
        </p>
      </header>

      {PROFILE_SECTIONS.map((section) => (
        <section key={section.key} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-brand-navy">{section.title}</h2>
            {section.description && (
              <p className="text-xs text-text-muted mt-0.5">{section.description}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROFILE_QUESTIONS.filter((q) => q.section === section.key).map((q) => (
              <ProfileField
                key={q.key as string}
                question={q}
                value={(profile as Record<string, unknown>)[q.key as string]}
                onChange={(v) => set(q.key as keyof RentaProfileResponse, v as never)}
              />
            ))}
          </div>

          {section.key === "familiar" && (
            <KidsEditor
              kids={profile.kids ?? []}
              onChange={(kids) => set("kids", kids)}
            />
          )}

          {section.key === "vivienda" && (
            <HousingEditor housing={housing} onChange={(h) => set("housing", h)} />
          )}
        </section>
      ))}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-text-muted hover:text-brand-navy"
        >
          ← Atrás
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

function ProfileField({
  question,
  value,
  onChange,
}: {
  question: (typeof PROFILE_QUESTIONS)[number];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-muted">
        {question.label}
        {question.required && <span className="text-red-500"> *</span>}
      </span>
      {question.kind === "ccaa-select" || question.kind === "select" ? (
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white"
        >
          <option value="">— Selecciona —</option>
          {question.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : question.kind === "date" ? (
        <input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg"
        />
      ) : question.kind === "number" ? (
        <input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          min={question.min}
          max={question.max}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg"
        />
      ) : question.kind === "boolean" ? (
        <div className="flex items-center gap-3 pt-1">
          <label className="inline-flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={String(question.key)}
              checked={value === true}
              onChange={() => onChange(true)}
            />
            <span>Sí</span>
          </label>
          <label className="inline-flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={String(question.key)}
              checked={value === false}
              onChange={() => onChange(false)}
            />
            <span>No</span>
          </label>
        </div>
      ) : question.kind === "textarea" ? (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          rows={3}
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg resize-none"
        />
      ) : (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg"
        />
      )}
      {question.help_text && (
        <span className="text-[11px] text-text-muted/80">{question.help_text}</span>
      )}
    </label>
  );
}

function KidsEditor({
  kids,
  onChange,
}: {
  kids: NonNullable<RentaProfileResponse["kids"]>;
  onChange: (kids: NonNullable<RentaProfileResponse["kids"]>) => void;
}) {
  function add() {
    onChange([
      ...kids,
      { id: crypto.randomUUID(), birth_date: "", disability_pct: 0, cohabits: true },
    ]);
  }
  function remove(id: string) {
    onChange(kids.filter((k) => k.id !== id));
  }
  function update(id: string, patch: Partial<(typeof kids)[number]>) {
    onChange(kids.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  }
  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-brand-navy">Hijos a cargo</p>
        <button type="button" onClick={add} className="text-xs text-brand-teal hover:underline">
          + Añadir hijo/a
        </button>
      </div>
      {kids.length === 0 ? (
        <p className="text-xs text-text-muted italic">Sin hijos a cargo.</p>
      ) : (
        kids.map((k) => (
          <div key={k.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] text-text-muted">Fecha nacimiento</span>
              <input
                type="date"
                value={k.birth_date}
                onChange={(e) => update(k.id, { birth_date: e.target.value })}
                className="text-xs px-2 py-1 border border-gray-200 rounded"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] text-text-muted">Discapacidad (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={k.disability_pct}
                onChange={(e) => update(k.id, { disability_pct: Number(e.target.value) })}
                className="text-xs px-2 py-1 border border-gray-200 rounded"
              />
            </label>
            <label className="inline-flex items-center gap-2 mt-3 text-xs">
              <input
                type="checkbox"
                checked={k.cohabits}
                onChange={(e) => update(k.id, { cohabits: e.target.checked })}
              />
              <span>Convive con el declarante</span>
            </label>
            <button
              type="button"
              onClick={() => remove(k.id)}
              className="text-xs text-red-600 hover:underline justify-self-end"
            >
              Eliminar
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function HousingEditor({
  housing,
  onChange,
}: {
  housing: RentaProfileResponse["housing"] | undefined;
  onChange: (h: RentaProfileResponse["housing"]) => void;
}) {
  const type = housing?.type ?? "";
  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-2">
      <p className="text-xs font-medium text-brand-navy">Vivienda habitual</p>
      <label className="flex flex-col gap-1 max-w-sm">
        <span className="text-[11px] text-text-muted">Régimen</span>
        <select
          value={type}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "alquiler") onChange({ type: "alquiler", monthly_rent_eur: 0, start_date: "" });
            else if (v === "propiedad")
              onChange({ type: "propiedad", is_habitual: true, acquisition_date: null });
            else if (v === "otro") onChange({ type: "otro" });
          }}
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white"
        >
          <option value="">— Selecciona —</option>
          <option value="alquiler">Alquiler</option>
          <option value="propiedad">Propiedad</option>
          <option value="otro">Otro (cesión, usufructo, etc.)</option>
        </select>
      </label>
      {housing?.type === "alquiler" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-text-muted">Renta mensual (€)</span>
            <input
              type="number"
              value={housing.monthly_rent_eur}
              onChange={(e) =>
                onChange({ ...housing, monthly_rent_eur: Number(e.target.value) })
              }
              className="text-xs px-2 py-1 border border-gray-200 rounded"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-text-muted">Inicio del contrato</span>
            <input
              type="date"
              value={housing.start_date}
              onChange={(e) => onChange({ ...housing, start_date: e.target.value })}
              className="text-xs px-2 py-1 border border-gray-200 rounded"
            />
          </label>
        </div>
      )}
      {housing?.type === "propiedad" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="inline-flex items-center gap-2 text-xs mt-3">
            <input
              type="checkbox"
              checked={housing.is_habitual}
              onChange={(e) => onChange({ ...housing, is_habitual: e.target.checked })}
            />
            <span>Es mi vivienda habitual</span>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-text-muted">Fecha de adquisición</span>
            <input
              type="date"
              value={housing.acquisition_date ?? ""}
              onChange={(e) =>
                onChange({ ...housing, acquisition_date: e.target.value || null })
              }
              className="text-xs px-2 py-1 border border-gray-200 rounded"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Step 3: Deductions
// ===========================================================================

function DeductionsStep({
  deductions,
  ccaa,
  deductionsResponse,
  onChange,
  onBack,
  onNext,
}: {
  deductions: RentaDeduction[];
  ccaa: CCAACode;
  deductionsResponse: Record<string, Record<string, unknown>>;
  onChange: (r: Record<string, Record<string, unknown>>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function setField(deductionId: string, key: string, value: unknown) {
    const current = deductionsResponse[deductionId] ?? {};
    onChange({ ...deductionsResponse, [deductionId]: { ...current, [key]: value } });
  }
  function setApplies(deductionId: string, applies: boolean) {
    if (applies) {
      onChange({ ...deductionsResponse, [deductionId]: deductionsResponse[deductionId] ?? {} });
    } else {
      const next = { ...deductionsResponse };
      delete next[deductionId];
      onChange(next);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-text-muted">Paso 3 de 4</p>
        <h1 className="text-xl font-semibold text-brand-navy mt-1">
          Deducciones de {CCAA_LABELS[ccaa]}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Según los datos que has introducido, estas son las deducciones que potencialmente te aplican.
          Marca las que correspondan y completa los campos requeridos.
        </p>
      </header>

      {deductions.length === 0 ? (
        <div className="text-sm text-text-muted bg-amber-50 border border-amber-200 rounded-lg p-4">
          No detectamos deducciones autonómicas aplicables con los datos introducidos. Tu asesor
          revisará igualmente tus datos por si encaja alguna deducción estatal o circunstancia
          adicional. Puedes continuar.
        </div>
      ) : (
        <div className="space-y-3">
          {deductions.map((d) => {
            const applies = d.id in deductionsResponse;
            const response = deductionsResponse[d.id] ?? {};
            return (
              <div
                key={d.id}
                className={
                  applies
                    ? "border border-brand-teal/40 bg-brand-teal/5 rounded-lg p-3"
                    : "border border-gray-100 rounded-lg p-3"
                }
              >
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applies}
                    onChange={(e) => setApplies(d.id, e.target.checked)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-brand-navy">{d.title}</p>
                    {d.summary && (
                      <p className="text-xs text-text-muted mt-0.5">{d.summary}</p>
                    )}
                    {d.legal_reference && (
                      <p className="text-[11px] text-text-muted/80 italic mt-0.5">
                        {d.legal_reference}
                      </p>
                    )}
                  </div>
                </label>
                {applies && d.extra_fields.length > 0 && (
                  <div className="mt-3 pl-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {d.extra_fields.map((field) => (
                      <ExtraFieldInput
                        key={field.key}
                        field={field}
                        value={response[field.key]}
                        onChange={(v) => setField(d.id, field.key, v)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-text-muted hover:text-brand-navy"
        >
          ← Atrás
        </button>
        <button
          type="button"
          onClick={onNext}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90"
        >
          Revisar y enviar
        </button>
      </div>
    </div>
  );
}

function ExtraFieldInput({
  field,
  value,
  onChange,
}: {
  field: RentaDeduction["extra_fields"][number];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-text-muted">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </span>
      {field.kind === "select" ? (
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="text-xs px-2 py-1 border border-gray-200 rounded bg-white"
        >
          <option value="">— Selecciona —</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.kind === "boolean" ? (
        <select
          value={value === undefined ? "" : value ? "true" : "false"}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : e.target.value === "true")
          }
          className="text-xs px-2 py-1 border border-gray-200 rounded bg-white"
        >
          <option value="">— Selecciona —</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      ) : field.kind === "textarea" ? (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          rows={2}
          className="text-xs px-2 py-1 border border-gray-200 rounded resize-none"
        />
      ) : (
        <input
          type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
          value={value === undefined || value === null ? "" : String(value)}
          min={field.min}
          max={field.max}
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? undefined
                : field.kind === "number"
                  ? Number(e.target.value)
                  : e.target.value,
            )
          }
          className="text-xs px-2 py-1 border border-gray-200 rounded"
        />
      )}
      {field.help_text && (
        <span className="text-[11px] text-text-muted/80">{field.help_text}</span>
      )}
    </label>
  );
}

// ===========================================================================
// Step 4: Review + submit
// ===========================================================================

function ReviewStep({
  token,
  authorizedFilerId,
  fullName,
  profile,
  deductionsResponse,
  applicableDeductions,
  onBack,
  onSubmitted,
}: {
  token: string;
  authorizedFilerId: string;
  fullName: string;
  profile: RentaProfileResponse;
  deductionsResponse: Record<string, Record<string, unknown>>;
  applicableDeductions: RentaDeduction[];
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await submitRenta({
        token,
        authorized_filer_id: authorizedFilerId,
        profile_response: profile,
        deductions_response: deductionsResponse,
      });
      if (res.ok) {
        onSubmitted();
      } else {
        const messages: Record<string, string> = {
          invalid_token: "El enlace ya no es válido.",
          not_authorized: "Tu DNI ya no figura como autorizado. Contacta con tu asesor.",
          already_submitted: "Ya hemos recibido tu declaración.",
          rate_limited: "Demasiados intentos. Espera un momento y vuelve a probar.",
          invalid_payload: res.message ?? "Faltan datos obligatorios.",
        };
        setError(messages[res.reason] ?? "Ha ocurrido un error.");
      }
    });
  }

  const selectedDeductions = applicableDeductions.filter((d) => d.id in deductionsResponse);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-text-muted">Paso 4 de 4</p>
        <h1 className="text-xl font-semibold text-brand-navy mt-1">Revisión y envío</h1>
        <p className="text-sm text-text-muted mt-1">
          Revisa los datos. Una vez envíes el formulario, no podrás editarlo — para correcciones tendrás
          que contactar con tu asesor.
        </p>
      </header>

      <section className="space-y-1.5">
        <h2 className="text-sm font-semibold text-brand-navy">Identificación</h2>
        <p className="text-sm text-text-muted">{fullName}</p>
      </section>

      <section className="space-y-1.5">
        <h2 className="text-sm font-semibold text-brand-navy">Tus datos</h2>
        <ul className="text-sm text-text-muted space-y-0.5">
          <li>Comunidad: {CCAA_LABELS[profile.ccaa]}</li>
          <li>Fecha de nacimiento: {profile.birth_date}</li>
          <li>Estado civil: {profile.civil_status}</li>
          <li>Vivienda: {profile.housing?.type}</li>
          <li>Hijos a cargo: {profile.kids?.length ?? 0}</li>
        </ul>
      </section>

      <section className="space-y-1.5">
        <h2 className="text-sm font-semibold text-brand-navy">
          Deducciones marcadas ({selectedDeductions.length})
        </h2>
        {selectedDeductions.length === 0 ? (
          <p className="text-sm text-text-muted italic">No has marcado ninguna deducción.</p>
        ) : (
          <ul className="text-sm text-text-muted list-disc list-inside space-y-0.5">
            {selectedDeductions.map((d) => (
              <li key={d.id}>{d.title}</li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-text-muted hover:text-brand-navy"
        >
          ← Atrás
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Enviando…" : "Enviar declaración"}
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Done
// ===========================================================================

function DoneStep({ fullName }: { fullName: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-3">
      <div className="w-12 h-12 mx-auto rounded-full bg-brand-teal/10 text-brand-teal flex items-center justify-center">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-brand-navy">¡Gracias, {fullName}!</h1>
      <p className="text-sm text-text-muted max-w-md mx-auto">
        Hemos recibido tu declaración. Tu asesor de Lean Finance la revisará y se pondrá en contacto
        contigo si necesita información adicional.
      </p>
      <p className="text-sm text-text-muted">
        ¿Otro familiar también tiene que rellenar el formulario? Puede usar el mismo enlace en otro
        dispositivo o pestaña con su DNI.
      </p>
    </div>
  );
}
