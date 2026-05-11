// Validadores y normalizadores para `client_apartados.form_response`.
// Compartidos entre la server action de cliente (submitFormApartado) y la de
// admin (adminSubmitFormApartado). NO es "use server" para poder importarse
// desde ambos módulos sin que Next.js los marque como entrypoints duplicados.

import { encryptEnisaPassword } from "@/lib/crypto/enisa";
import type {
  CompetidoresFormResponse,
  EnisaFormResponse,
} from "@/lib/types/documentation";

const ENISA_FIELD_MAX = 255;
const COMPETIDOR_FIELD_MAX = 255;
const COMPETIDORES_MAX_ENTRIES = 50;

export function validateAndEncryptEnisaPayload(
  raw: unknown,
  existing: Record<string, unknown> | null
): EnisaFormResponse {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Datos ENISA inválidos");
  }
  const obj = raw as { user?: unknown; password?: unknown };
  const userValue = typeof obj.user === "string" ? obj.user.trim() : "";
  if (!userValue) throw new Error("Usuario obligatorio");
  if (userValue.length > ENISA_FIELD_MAX) {
    throw new Error("Usuario demasiado largo");
  }

  // Password vacía ⇒ conservamos la encriptada anterior (no rotamos). Si no
  // hay anterior, exigimos password.
  const passwordRaw = typeof obj.password === "string" ? obj.password : "";
  let password_encrypted: string;
  if (passwordRaw.length === 0) {
    const prev = existing?.password_encrypted;
    if (typeof prev !== "string" || prev.length === 0) {
      throw new Error("Contraseña obligatoria");
    }
    password_encrypted = prev;
  } else {
    if (passwordRaw.length > ENISA_FIELD_MAX) {
      throw new Error("Contraseña demasiado larga");
    }
    password_encrypted = encryptEnisaPassword(passwordRaw);
  }
  return { user: userValue, password_encrypted };
}

export function validateCompetidoresPayload(
  raw: unknown
): CompetidoresFormResponse {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Datos de competidores inválidos");
  }
  const obj = raw as { entries?: unknown };
  if (!Array.isArray(obj.entries)) {
    throw new Error("Listado de competidores inválido");
  }
  if (obj.entries.length > COMPETIDORES_MAX_ENTRIES) {
    throw new Error(`Máximo ${COMPETIDORES_MAX_ENTRIES} competidores`);
  }

  // Regla: las entradas completamente vacías se descartan silenciosamente.
  // Cada entrada que se conserva tiene al menos un campo no vacío. El total de
  // entradas puede ser 0 ("no tengo competidores que reportar").
  const cleaned: CompetidoresFormResponse["entries"] = [];
  for (const entry of obj.entries) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Competidor inválido");
    }
    const e = entry as Record<string, unknown>;
    const comercial = typeof e.comercial === "string" ? e.comercial.trim() : "";
    const fiscal = typeof e.fiscal === "string" ? e.fiscal.trim() : "";
    const cif = typeof e.cif === "string" ? e.cif.trim() : "";
    if (
      comercial.length > COMPETIDOR_FIELD_MAX ||
      fiscal.length > COMPETIDOR_FIELD_MAX ||
      cif.length > COMPETIDOR_FIELD_MAX
    ) {
      throw new Error("Campos de competidor demasiado largos");
    }
    if (!comercial && !fiscal && !cif) continue;
    cleaned.push({ comercial, fiscal, cif });
  }

  return { entries: cleaned };
}
