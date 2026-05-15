"use client";

import { useMemo, useState, useTransition } from "react";
import { submitRenta, verifyDni } from "../actions";
import { evaluateRule } from "@/lib/renta/rule-engine";
import { PROFILE_QUESTIONS } from "@/lib/renta/profile-schema";
import { isValidDni, normalizeDni } from "@/lib/renta/dni";
import { CCAA_LABELS, type CCAACode, type RentaDeduction, type RentaProfileResponse } from "@/lib/types/renta";

interface Props {
  token: string;
  companyId: string;
  invitationId: string;
  deductions: RentaDeduction[];
  /** Emails de los técnicos del servicio para el botón "Contacta con tu asesor". */
  advisorEmails: string[];
}

// Steps lineales del formulario. Cada step de perfil se reparte en una pantalla
// temática (más cortas, menos abrumadoras). Tras el perfil viene un wizard
// secuencial de deducciones (una por pantalla) y finalmente el review + done.
type Step =
  | "dni"
  | "location"
  | "personal"
  | "family"
  | "income"
  | "deductions"
  | "review"
  | "done";

// Total de "Paso X de N" mostrados al usuario en la cabecera. No incluye DNI
// (que es la verificación previa) ni `done` (que es confirmación final).
const TOTAL_PROFILE_STEPS = 5; // location, personal, family, income, deductions, review
const TOTAL_STEPS = 6;

export default function RentaForm({ token, deductions, advisorEmails }: Props) {
  const [step, setStep] = useState<Step>("dni");
  const [authorizedFilerId, setAuthorizedFilerId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [profile, setProfile] = useState<Partial<RentaProfileResponse>>({
    kids: [],
    disability_pct: 0,
  });
  const [deductionsResponse, setDeductionsResponse] = useState<Record<string, Record<string, unknown>>>({});
  // IDs de deducciones marcadas como "No estoy seguro" (sin extra_fields).
  const [uncertainIds, setUncertainIds] = useState<string[]>([]);

  const applicableDeductions = useMemo(() => {
    if (!profile.ccaa) return [];
    return deductions
      .filter((d) => d.ccaa_code === profile.ccaa)
      .filter((d) => evaluateRule(d.eligibility_rule, profile));
  }, [deductions, profile]);

  let content: React.ReactNode;
  if (step === "dni") {
    content = (
      <DniStep
        token={token}
        onVerified={(filerId, name) => {
          setAuthorizedFilerId(filerId);
          setFullName(name);
          setStep("location");
        }}
      />
    );
  } else if (step === "location") {
    content = (
      <LocationStep
        fullName={fullName}
        profile={profile}
        onChange={setProfile}
        onBack={() => setStep("dni")}
        onNext={() => setStep("personal")}
      />
    );
  } else if (step === "personal") {
    content = (
      <PersonalStep
        profile={profile}
        onChange={setProfile}
        onBack={() => setStep("location")}
        onNext={() => setStep("family")}
      />
    );
  } else if (step === "family") {
    content = (
      <FamilyStep
        profile={profile}
        onChange={setProfile}
        onBack={() => setStep("personal")}
        onNext={() => setStep("income")}
      />
    );
  } else if (step === "income") {
    content = (
      <IncomeStep
        profile={profile}
        onChange={setProfile}
        onBack={() => setStep("family")}
        onNext={() => setStep("deductions")}
      />
    );
  } else if (step === "deductions") {
    content = (
      <DeductionsWizardStep
        deductions={applicableDeductions}
        ccaa={profile.ccaa!}
        deductionsResponse={deductionsResponse}
        onChange={setDeductionsResponse}
        uncertainIds={uncertainIds}
        onChangeUncertain={setUncertainIds}
        onBack={() => setStep("income")}
        onNext={() => setStep("review")}
      />
    );
  } else if (step === "review") {
    content = (
      <ReviewStep
        token={token}
        authorizedFilerId={authorizedFilerId!}
        fullName={fullName}
        profile={profile as RentaProfileResponse}
        deductionsResponse={deductionsResponse}
        uncertainIds={uncertainIds}
        applicableDeductions={applicableDeductions}
        onBack={() => setStep("deductions")}
        onSubmitted={() => setStep("done")}
      />
    );
  } else {
    content = <DoneStep fullName={fullName} />;
  }

  return (
    <div className="space-y-4">
      {content}
      {step !== "done" && <AdvisorContactFooter advisorEmails={advisorEmails} />}
    </div>
  );
}

/**
 * Enlace persistente al pie del formulario que abre el cliente de correo del
 * usuario con los técnicos del servicio en destinatario (igual que el botón
 * "Contacta con tu asesor" de Modelos fiscales). Si no hay técnicos resueltos
 * para la empresa, no se muestra nada.
 */
function AdvisorContactFooter({ advisorEmails }: { advisorEmails: string[] }) {
  if (advisorEmails.length === 0) return null;
  const href = `mailto:${advisorEmails.join(",")}?subject=${encodeURIComponent(
    "Consulta sobre el formulario de la declaración de la renta",
  )}`;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 shadow-sm">
      <p className="text-sm text-text-muted">¿Tienes dudas mientras rellenas el formulario?</p>
      <a
        href={href}
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-teal hover:underline"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Contacta con tu asesor
      </a>
    </div>
  );
}

// ===========================================================================
// Utilidades compartidas
// ===========================================================================

/**
 * Devuelve la pregunta del schema declarativo por `key`. Tira si no existe
 * (catch en dev: una key mal escrita debe explotar).
 */
function getQuestion(key: string) {
  const q = PROFILE_QUESTIONS.find((q) => q.key === key);
  if (!q) throw new Error(`Pregunta no encontrada: ${key}`);
  return q;
}

function StepHeader({
  stepNumber,
  title,
  description,
}: {
  stepNumber: number;
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <header>
      <p className="text-xs uppercase tracking-wider text-text-muted">
        Paso {stepNumber} de {TOTAL_STEPS}
      </p>
      <h1 className="text-xl font-semibold text-brand-navy mt-1">{title}</h1>
      {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
    </header>
  );
}

function StepFooter({
  onBack,
  canAdvance = true,
  nextLabel = "Continuar",
}: {
  onBack: () => void;
  canAdvance?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-text-muted hover:text-brand-navy"
      >
        ← Atrás
      </button>
      <button
        type="submit"
        disabled={!canAdvance}
        className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50"
      >
        {nextLabel}
      </button>
    </div>
  );
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleVerify();
      }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5"
    >
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
        type="submit"
        disabled={isPending || dni.length === 0}
        className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Verificando…" : "Continuar"}
      </button>
    </form>
  );
}

// ===========================================================================
// Step 2: Ubicación + vivienda habitual
// ===========================================================================

function LocationStep({
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
  const canAdvance = !!profile.ccaa && !!housing;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canAdvance) onNext();
      }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5"
    >
      <StepHeader
        stepNumber={2}
        title="¿Dónde resides?"
        description={
          <>
            Hola <span className="font-medium text-brand-navy">{fullName}</span>. Tu comunidad
            autónoma determina qué deducciones podemos aplicarte.
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ProfileField
          question={getQuestion("ccaa")}
          value={profile.ccaa}
          onChange={(v) => set("ccaa", v as CCAACode)}
        />
        <ProfileField
          question={getQuestion("small_municipality")}
          value={profile.small_municipality}
          onChange={(v) => set("small_municipality", v as boolean)}
        />
      </div>

      <HousingEditor housing={housing} onChange={(h) => set("housing", h)} />

      <StepFooter onBack={onBack} canAdvance={canAdvance} />
    </form>
  );
}

// ===========================================================================
// Step 3: Datos personales
// ===========================================================================

function PersonalStep({
  profile,
  onChange,
  onBack,
  onNext,
}: {
  profile: Partial<RentaProfileResponse>;
  onChange: (p: Partial<RentaProfileResponse>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function set<K extends keyof RentaProfileResponse>(key: K, value: RentaProfileResponse[K]) {
    onChange({ ...profile, [key]: value });
  }

  const canAdvance = !!profile.birth_date && profile.disability_pct !== undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canAdvance) onNext();
      }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5"
    >
      <StepHeader
        stepNumber={3}
        title="Datos personales"
        description="Solo dos datos básicos sobre ti."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ProfileField
          question={getQuestion("birth_date")}
          value={profile.birth_date}
          onChange={(v) => set("birth_date", v as string)}
        />
        <ProfileField
          question={getQuestion("disability_pct")}
          value={profile.disability_pct}
          onChange={(v) =>
            // disability_pct admite 0 como valor semántico (no discapacidad);
            // pero también dejamos que el usuario lo borre y vuelva a tipear.
            set("disability_pct", (v === undefined ? 0 : (v as number)))
          }
        />
      </div>

      <StepFooter onBack={onBack} canAdvance={canAdvance} />
    </form>
  );
}

// ===========================================================================
// Step 4: Situación familiar
// ===========================================================================

function FamilyStep({
  profile,
  onChange,
  onBack,
  onNext,
}: {
  profile: Partial<RentaProfileResponse>;
  onChange: (p: Partial<RentaProfileResponse>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function set<K extends keyof RentaProfileResponse>(key: K, value: RentaProfileResponse[K]) {
    onChange({ ...profile, [key]: value });
  }

  const canAdvance = !!profile.civil_status;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canAdvance) onNext();
      }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5"
    >
      <StepHeader
        stepNumber={4}
        title="Situación familiar"
        description="Si tienes hijos a cargo, añádelos aquí."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ProfileField
          question={getQuestion("civil_status")}
          value={profile.civil_status}
          onChange={(v) => set("civil_status", v as RentaProfileResponse["civil_status"])}
        />
        <ProfileField
          question={getQuestion("declaration_mode")}
          value={profile.declaration_mode}
          onChange={(v) =>
            set("declaration_mode", v as RentaProfileResponse["declaration_mode"])
          }
        />
        <ProfileField
          question={getQuestion("monoparental")}
          value={profile.monoparental}
          onChange={(v) => set("monoparental", v as boolean)}
        />
        <ProfileField
          question={getQuestion("large_family")}
          value={profile.large_family}
          onChange={(v) => set("large_family", v as RentaProfileResponse["large_family"])}
        />
      </div>

      <KidsEditor kids={profile.kids ?? []} onChange={(kids) => set("kids", kids)} />

      <StepFooter onBack={onBack} canAdvance={canAdvance} />
    </form>
  );
}

// ===========================================================================
// Step 5: Ingresos + notas
// ===========================================================================

function IncomeStep({
  profile,
  onChange,
  onBack,
  onNext,
}: {
  profile: Partial<RentaProfileResponse>;
  onChange: (p: Partial<RentaProfileResponse>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function set<K extends keyof RentaProfileResponse>(key: K, value: RentaProfileResponse[K]) {
    onChange({ ...profile, [key]: value });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5"
    >
      <StepHeader
        stepNumber={5}
        title="Ingresos"
        description="Si no sabes la cifra exacta, déjala en blanco — tu asesor la completará."
      />

      <ProfileField
        question={getQuestion("income_base")}
        value={profile.income_base}
        onChange={(v) => set("income_base", v as number | undefined as RentaProfileResponse["income_base"])}
      />

      <ProfileField
        question={getQuestion("notes")}
        value={profile.notes}
        onChange={(v) => set("notes", v as string | undefined as RentaProfileResponse["notes"])}
      />

      <StepFooter onBack={onBack} canAdvance={true} nextLabel="Ver deducciones" />
    </form>
  );
}

// ===========================================================================
// Campo de perfil genérico (renderiza una pregunta del schema declarativo)
// ===========================================================================

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
          // value vacío cuando undefined/null: permite borrar y rellenar (fix
          // del bug "no puedo borrar el 0" cuando el input se inicializaba a 0).
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
                // value vacío cuando undefined → permite borrar y rellenar.
                value={k.disability_pct === undefined ? "" : String(k.disability_pct)}
                onChange={(e) =>
                  update(k.id, {
                    disability_pct: e.target.value === "" ? 0 : Number(e.target.value),
                  })
                }
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
            if (v === "alquiler")
              // monthly_rent_eur undefined al inicio: el input se queda vacío
              // y permite tipear sin tener que borrar el 0 (fix UX).
              onChange({
                type: "alquiler",
                monthly_rent_eur: undefined as unknown as number,
                start_date: "",
              });
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
              min={0}
              // Mismo patrón "vacío cuando undefined" que en disability_pct.
              value={
                housing.monthly_rent_eur === undefined || housing.monthly_rent_eur === null
                  ? ""
                  : String(housing.monthly_rent_eur)
              }
              onChange={(e) =>
                onChange({
                  ...housing,
                  monthly_rent_eur:
                    e.target.value === ""
                      ? (undefined as unknown as number)
                      : Number(e.target.value),
                })
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
// Step 6: Wizard de deducciones (una pregunta por pantalla)
// ===========================================================================

type DeductionDecision = "yes" | "uncertain";

function DeductionsWizardStep({
  deductions,
  ccaa,
  deductionsResponse,
  onChange,
  uncertainIds,
  onChangeUncertain,
  onBack,
  onNext,
}: {
  deductions: RentaDeduction[];
  ccaa: CCAACode;
  deductionsResponse: Record<string, Record<string, unknown>>;
  onChange: (r: Record<string, Record<string, unknown>>) => void;
  uncertainIds: string[];
  onChangeUncertain: (ids: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  // Índice de la deducción que se está mostrando. Si supera la longitud,
  // saltamos a review. Si retrocede de 0, volvemos al step anterior (ingresos).
  const [currentIdx, setCurrentIdx] = useState(0);
  // Decisión pendiente para la pantalla actual cuando aún no se ha resuelto:
  // "yes" persiste la deducción y muestra los extra_fields; "uncertain" la
  // registra como dudosa y avanza; "No me aplica" avanza directamente.
  const [pendingDecision, setPendingDecision] = useState<DeductionDecision | undefined>(undefined);

  // Caso borde: no hay deducciones aplicables → mostramos un mensaje y un único
  // botón "Continuar al envío" que salta al review.
  if (deductions.length === 0) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5"
      >
        <StepHeader
          stepNumber={6}
          title={`Deducciones de ${CCAA_LABELS[ccaa]}`}
        />
        <div className="text-sm text-text-muted bg-amber-50 border border-amber-200 rounded-lg p-4">
          No detectamos deducciones autonómicas aplicables con los datos introducidos. Tu asesor
          revisará igualmente tus datos por si encaja alguna deducción estatal o circunstancia
          adicional.
        </div>
        <StepFooter onBack={onBack} canAdvance={true} nextLabel="Continuar" />
      </form>
    );
  }

  const deduction = deductions[currentIdx];
  const savedResponse = deductionsResponse[deduction.id];
  const isAccepted = savedResponse !== undefined;
  const isUncertain = uncertainIds.includes(deduction.id);
  // Resolución de la decisión mostrada: una decisión ya guardada (al volver
  // atrás) tiene prioridad sobre la pendiente local de esta pantalla.
  const decision: DeductionDecision | undefined = isAccepted
    ? "yes"
    : isUncertain
      ? "uncertain"
      : pendingDecision;

  function goPrev() {
    setPendingDecision(undefined);
    if (currentIdx === 0) {
      onBack();
    } else {
      setCurrentIdx((i) => i - 1);
    }
  }

  function goNext() {
    setPendingDecision(undefined);
    if (currentIdx + 1 >= deductions.length) {
      onNext();
    } else {
      setCurrentIdx((i) => i + 1);
    }
  }

  function removeFromUncertain() {
    if (isUncertain) onChangeUncertain(uncertainIds.filter((id) => id !== deduction.id));
  }

  function acceptDeduction() {
    // "Sí me aplica": crea (o conserva) la entrada en el response map y la
    // saca de la lista de dudosas si estaba ahí.
    removeFromUncertain();
    onChange({ ...deductionsResponse, [deduction.id]: savedResponse ?? {} });
    setPendingDecision("yes");
  }

  function markUncertain() {
    // "No estoy seguro": registra el id como dudoso (sin extra_fields) y avanza.
    const next = { ...deductionsResponse };
    delete next[deduction.id];
    onChange(next);
    if (!uncertainIds.includes(deduction.id)) {
      onChangeUncertain([...uncertainIds, deduction.id]);
    }
    goNext();
  }

  function rejectDeduction() {
    // "No me aplica": borra cualquier rastro de la deducción y avanza.
    const next = { ...deductionsResponse };
    delete next[deduction.id];
    onChange(next);
    removeFromUncertain();
    goNext();
  }

  function resetDecision() {
    // Permite cambiar de opinión: limpia respuestas/dudas y vuelve a mostrar
    // el selector de tres opciones.
    const next = { ...deductionsResponse };
    delete next[deduction.id];
    onChange(next);
    removeFromUncertain();
    setPendingDecision(undefined);
  }

  function setField(key: string, value: unknown) {
    const current = deductionsResponse[deduction.id] ?? {};
    onChange({ ...deductionsResponse, [deduction.id]: { ...current, [key]: value } });
  }

  // Cuando la deducción se marca "Sí" y se completan los campos obligatorios,
  // permitimos avanzar. Las dudosas avanzan sin requisitos.
  const response = savedResponse ?? {};
  const requiredFieldsOk = deduction.extra_fields
    .filter((f) => f.required)
    .every((f) => {
      const v = response[f.key];
      return v !== undefined && v !== null && v !== "";
    });
  const canAdvance = decision === "uncertain" || (decision === "yes" && requiredFieldsOk);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canAdvance) goNext();
      }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5"
    >
      <StepHeader
        stepNumber={6}
        title={`Deducciones de ${CCAA_LABELS[ccaa]}`}
        description={
          <>
            Deducción {currentIdx + 1} de {deductions.length}
          </>
        }
      />

      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-brand-navy">{deduction.title}</h2>
      </div>

      <DeductionInfo
        whatCovers={deduction.what_covers}
        requirements={deduction.requirements}
      />

      {decision === undefined && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-brand-navy">¿Te aplica esta deducción?</p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={acceptDeduction}
              className="text-sm font-medium py-3 px-5 rounded-lg bg-brand-teal text-white hover:opacity-90"
            >
              Sí, me aplica
            </button>
            <button
              type="button"
              onClick={markUncertain}
              className="text-sm font-medium py-3 px-5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            >
              No estoy seguro
            </button>
            <button
              type="button"
              onClick={rejectDeduction}
              className="text-sm font-medium py-3 px-5 rounded-lg border border-gray-200 text-brand-navy hover:bg-gray-50"
            >
              No me aplica
            </button>
          </div>
          <p className="text-xs text-text-muted">
            Si no lo tienes claro, marca{" "}
            <span className="font-medium text-amber-700">«No estoy seguro»</span>: tu asesor lo
            revisará y te dirá si te corresponde.
          </p>
        </div>
      )}

      {decision === "uncertain" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-amber-200 text-amber-900 text-xs">
              ?
            </span>
            <span>Marcada como «No estoy seguro»</span>
            <button
              type="button"
              onClick={resetDecision}
              className="ml-auto text-[11px] font-normal text-amber-700 hover:underline"
            >
              cambiar
            </button>
          </div>
          <p className="text-xs text-amber-800/90">
            Tu asesor de Lean Finance revisará esta deducción y valorará si te corresponde. No
            necesitas rellenar nada más aquí.
          </p>
        </div>
      )}

      {decision === "yes" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-brand-teal">
            <span className="inline-flex w-4 h-4 items-center justify-center rounded-full bg-brand-teal/15">
              ✓
            </span>
            <span>Marcada como aplicable. Completa los datos abajo.</span>
            <button
              type="button"
              onClick={resetDecision}
              className="ml-auto text-[11px] text-text-muted hover:underline"
            >
              cambiar
            </button>
          </div>

          {deduction.extra_fields.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {deduction.extra_fields.map((field) => (
                <ExtraFieldInput
                  key={field.key}
                  field={field}
                  value={response[field.key]}
                  onChange={(v) => setField(field.key, v)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted italic">
              No hay datos adicionales que rellenar para esta deducción.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={goPrev}
          className="text-sm text-text-muted hover:text-brand-navy"
        >
          ← Atrás
        </button>
        {decision === undefined ? (
          <span className="text-xs text-text-muted">Elige una opción para continuar</span>
        ) : (
          <button
            type="submit"
            disabled={!canAdvance}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50"
          >
            {currentIdx + 1 >= deductions.length ? "Revisar y enviar" : "Continuar"}
          </button>
        )}
      </div>

      {deduction.legal_reference && (
        <p className="text-[10px] text-text-muted/70 italic font-mono pt-2 border-t border-gray-100">
          {deduction.legal_reference}
        </p>
      )}
    </form>
  );
}

/**
 * Bloque informativo de la deducción con dos tarjetas:
 *   1. "Qué cubre" — descripción de la deducción (campo what_covers del catálogo).
 *   2. "Requisitos para aplicar" — checklist de requisitos (campo requirements
 *      del catálogo, ya curado en seed) que el contribuyente verifica.
 *
 * Ambos campos vienen directamente del catálogo extraído del manual oficial
 * y mantenidos en supabase/seeds/renta/deductions/*.json. No hay heurística
 * en render — si el catálogo lo dice, lo mostramos tal cual.
 */
function DeductionInfo({
  whatCovers,
  requirements,
}: {
  whatCovers: string | null;
  requirements: string[];
}) {
  const hasRequirements = requirements.length > 0;
  return (
    <div className="space-y-3">
      {whatCovers && (
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
            Qué cubre
          </p>
          <p className="text-sm text-brand-navy leading-relaxed">{whatCovers}</p>
        </div>
      )}

      {hasRequirements && (
        <div className="rounded-xl bg-brand-teal/5 border border-brand-teal/20 p-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-brand-teal">
            Requisitos para aplicar
          </p>
          <p className="text-xs text-text-muted">
            Repasa estos puntos para decidir si te aplica:
          </p>
          <ul className="space-y-1.5 pt-1">
            {requirements.map((req, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-brand-navy">
                <span
                  aria-hidden
                  className="mt-1.5 inline-block w-1.5 h-1.5 shrink-0 rounded-full bg-brand-teal"
                />
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
// Review + submit
// ===========================================================================

function ReviewStep({
  token,
  authorizedFilerId,
  fullName,
  profile,
  deductionsResponse,
  uncertainIds,
  applicableDeductions,
  onBack,
  onSubmitted,
}: {
  token: string;
  authorizedFilerId: string;
  fullName: string;
  profile: RentaProfileResponse;
  deductionsResponse: Record<string, Record<string, unknown>>;
  uncertainIds: string[];
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
        uncertain_deduction_ids: uncertainIds,
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
  const uncertainDeductions = applicableDeductions.filter((d) => uncertainIds.includes(d.id));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!isPending) handleSubmit();
      }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5"
    >
      <header>
        <p className="text-xs uppercase tracking-wider text-text-muted">
          Paso {TOTAL_PROFILE_STEPS + 1} de {TOTAL_STEPS}
        </p>
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

      {uncertainDeductions.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-sm font-semibold text-brand-navy">
            Deducciones con dudas ({uncertainDeductions.length})
          </h2>
          <p className="text-xs text-text-muted">
            Tu asesor revisará estas deducciones y valorará si te corresponden.
          </p>
          <ul className="text-sm text-text-muted list-disc list-inside space-y-0.5">
            {uncertainDeductions.map((d) => (
              <li key={d.id}>{d.title}</li>
            ))}
          </ul>
        </section>
      )}

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
          type="submit"
          disabled={isPending}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Enviando…" : "Enviar declaración"}
        </button>
      </div>
    </form>
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
        ¿Hay más personas que tienen que rellenar el formulario? Pueden usar este mismo enlace cada
        una con su DNI.
      </p>
    </div>
  );
}
