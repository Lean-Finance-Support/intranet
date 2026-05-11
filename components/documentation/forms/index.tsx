"use client";

import type { FormApartadoSlug } from "@/lib/types/documentation";
import EnisaForm from "./enisa";
import CompetidoresForm from "./competidores";

interface CompetidorEntry {
  comercial: string;
  fiscal: string;
  cif: string;
}

interface FormDispatcherProps {
  slug: string;
  mode: "client" | "admin";
  // Si false, el formulario se muestra deshabilitado (solo lectura).
  canEdit: boolean;
  formResponse: unknown;
  // Callback para enviar el formulario. `payload` debe ya tener la forma que
  // espera el server action para `slug`. Sólo se invoca si canEdit=true.
  onSubmit?: (slug: FormApartadoSlug, payload: unknown) => Promise<void>;
  // Admin (solo ENISA): descifrar la contraseña on-demand.
  onRevealEnisaPassword?: () => Promise<string>;
}

export default function FormDispatcher({
  slug,
  mode,
  canEdit,
  formResponse,
  onSubmit,
  onRevealEnisaPassword,
}: FormDispatcherProps) {
  if (slug === "enisa-credentials") {
    const stored = parseEnisaStored(formResponse);
    return (
      <EnisaForm
        mode={mode}
        canEdit={canEdit}
        stored={stored}
        onSubmit={
          canEdit && onSubmit
            ? (input) => onSubmit("enisa-credentials", input)
            : undefined
        }
        onRevealPassword={onRevealEnisaPassword}
      />
    );
  }
  if (slug === "competidores") {
    const stored = parseCompetidoresStored(formResponse);
    return (
      <CompetidoresForm
        mode={mode}
        canEdit={canEdit}
        stored={stored}
        onSubmit={
          canEdit && onSubmit
            ? (entries) => onSubmit("competidores", { entries })
            : undefined
        }
      />
    );
  }
  return (
    <p className="text-sm text-text-muted italic">
      Formulario no reconocido ({slug}). Contacta con Lean Finance.
    </p>
  );
}

function parseEnisaStored(
  raw: unknown
): { user: string; has_password: boolean } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const user = typeof r.user === "string" ? r.user : "";
  const has_password =
    typeof r.password_encrypted === "string" && r.password_encrypted.length > 0;
  if (!user && !has_password) return null;
  return { user, has_password };
}

function parseCompetidoresStored(raw: unknown): CompetidorEntry[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { entries?: unknown };
  if (!Array.isArray(r.entries)) return null;
  const entries: CompetidorEntry[] = [];
  for (const e of r.entries) {
    if (typeof e !== "object" || e === null) continue;
    const obj = e as Record<string, unknown>;
    entries.push({
      comercial: typeof obj.comercial === "string" ? obj.comercial : "",
      fiscal: typeof obj.fiscal === "string" ? obj.fiscal : "",
      cif: typeof obj.cif === "string" ? obj.cif : "",
    });
  }
  return entries.length > 0 ? entries : null;
}
