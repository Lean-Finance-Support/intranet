// Extracción de datos de una propuesta de ventas firmada (PDF) vía la API de
// Claude. Usa el bloque `document` nativo (PDF base64) y salida estructurada
// con `tools`. Server-only — nunca importar desde un componente cliente.

import Anthropic from "@anthropic-ai/sdk";
import type {
  ProposalExtraction,
  ProposalServiceMatch,
  ServiceCatalogItem,
  ServiceConfidence,
} from "./types";

/** Modelo de extracción. Centralizado para poder subir a Opus si hace falta. */
export const EXTRACTION_MODEL = "claude-sonnet-4-6";

const EXTRACTION_TOOL_NAME = "registrar_propuesta";

const EXTRACTION_TOOL = {
  name: EXTRACTION_TOOL_NAME,
  description:
    "Registra los datos extraídos de la propuesta de ventas firmada.",
  input_schema: {
    type: "object" as const,
    properties: {
      company: {
        type: "object",
        properties: {
          legal_name: { type: "string", description: "Razón social completa." },
          company_name: {
            type: "string",
            description:
              "Nombre comercial. Si la propuesta no lo distingue, repite la razón social.",
          },
          nif: { type: "string", description: "NIF/CIF tal cual aparece." },
        },
        required: ["legal_name", "company_name", "nif"],
      },
      signer: {
        type: "object",
        properties: {
          name: { type: "string" },
          surname: { type: "string" },
          dni: { type: "string", description: "DNI/NIF del firmante." },
          email: {
            type: "string",
            description:
              "Email del firmante. SOLO del audit report de Adobe Acrobat Sign (línea 'Web Form filled in by ...'). Cadena vacía si no aparece ahí.",
          },
        },
        required: ["name", "surname", "dni", "email"],
      },
      services: {
        type: "array",
        description: "Una entrada por línea de la tabla de presupuesto.",
        items: {
          type: "object",
          properties: {
            raw_text: { type: "string", description: "Texto literal de la línea." },
            service_id: {
              type: ["string", "null"],
              description:
                "Id del catálogo que mejor corresponde, o null si ninguno encaja.",
            },
            confidence: {
              type: "string",
              enum: ["high", "low", "none"],
              description:
                "high = mapeo claro; low = posible pero dudoso; none = sin match.",
            },
          },
          required: ["raw_text", "service_id", "confidence"],
        },
      },
      client_bank_account: {
        type: ["object", "null"],
        description:
          "Cuenta bancaria DEL CLIENTE (p.ej. domiciliación de pagos del cliente). null si no la hay o si la única cuenta del PDF es la de pago a Lean Finance.",
        properties: {
          iban: { type: "string" },
          bank_name: { type: ["string", "null"] },
          label: { type: ["string", "null"] },
        },
      },
    },
    required: ["company", "signer", "services", "client_bank_account"],
  },
};

function buildInstructions(catalog: ServiceCatalogItem[]): string {
  const catalogLines = catalog
    .map((s) => `- id=${s.id} | ${s.name} (slug: ${s.slug})`)
    .join("\n");
  return `Eres un asistente que extrae datos de una propuesta de ventas de Lean Finance ya firmada.

Extrae con la herramienta \`${EXTRACTION_TOOL_NAME}\`:

1. EMPRESA y FIRMANTE: de la página "Aceptación y firma" (CIF, Nombre Empresa, Dirección Fiscal, datos del firmante: Nombre, Apellidos, Rango Social, DNI/NIF).
2. EMAIL DEL FIRMANTE: SOLO del audit report de Adobe Acrobat Sign (última página), en la línea "Web Form filled in by Nombre (email)". Si no lo encuentras ahí, devuelve cadena vacía — no inventes ni uses otro email del documento.
3. SERVICIOS: cada línea de la tabla de presupuesto (columnas Descripción | Importe). Mapea cada línea al catálogo de servicios de abajo devolviendo su \`id\`. Si dudas, usa confidence "low"; si no encaja ninguno, service_id null y confidence "none". Devuelve el \`id\` EXACTO del catálogo, nunca uno inventado.
4. CUENTA BANCARIA: devuelve \`client_bank_account\` SOLO si la propuesta identifica explícitamente una cuenta DEL CLIENTE (p.ej. domiciliación de los pagos del cliente). La cuenta bancaria que aparece para que el cliente PAGUE a Lean Finance (típicamente BBVA) NUNCA se extrae. Si la única cuenta del PDF es esa, devuelve null.
5. NIF: devuélvelo tal cual aparece, sin normalizar.

CATÁLOGO DE SERVICIOS:
${catalogLines}`;
}

/** Devuelve la lista de servicios post-procesada: valida que el id exista. */
function normalizeServices(
  raw: unknown,
  catalogIds: Set<string>
): ProposalServiceMatch[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item): ProposalServiceMatch => {
    const obj = (item ?? {}) as Record<string, unknown>;
    const rawText = typeof obj.raw_text === "string" ? obj.raw_text : "";
    const rawId =
      typeof obj.service_id === "string" && obj.service_id ? obj.service_id : null;
    const confidence: ServiceConfidence =
      obj.confidence === "high" || obj.confidence === "low" ? obj.confidence : "none";
    // Post-procesado: el id debe existir en el catálogo. Si no, o si no hay id,
    // no es un match aprovechable → service_id null, confidence none.
    if (!rawId || !catalogIds.has(rawId)) {
      return { raw_text: rawText, service_id: null, confidence: "none" };
    }
    return { raw_text: rawText, service_id: rawId, confidence };
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Valida y post-procesa la salida del modelo. Pura — testeable sin red.
 * Lanza si la entrada no es un objeto.
 */
export function parseExtractionResponse(
  input: unknown,
  catalog: ServiceCatalogItem[]
): ProposalExtraction {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("La respuesta del modelo no tiene el formato esperado.");
  }
  const obj = input as Record<string, unknown>;
  const company = (obj.company ?? {}) as Record<string, unknown>;
  const signer = (obj.signer ?? {}) as Record<string, unknown>;
  const catalogIds = new Set(catalog.map((s) => s.id));

  let clientBankAccount: ProposalExtraction["client_bank_account"] = null;
  const bank = obj.client_bank_account;
  if (bank && typeof bank === "object" && !Array.isArray(bank)) {
    const b = bank as Record<string, unknown>;
    const iban = str(b.iban).trim();
    if (iban) {
      clientBankAccount = {
        iban,
        bank_name: typeof b.bank_name === "string" && b.bank_name ? b.bank_name : null,
        label: typeof b.label === "string" && b.label ? b.label : null,
      };
    }
  }

  return {
    company: {
      legal_name: str(company.legal_name),
      company_name: str(company.company_name) || str(company.legal_name),
      nif: str(company.nif),
    },
    signer: {
      name: str(signer.name),
      surname: str(signer.surname),
      dni: str(signer.dni),
      email: str(signer.email),
    },
    services: normalizeServices(obj.services, catalogIds),
    client_bank_account: clientBankAccount,
  };
}

/**
 * Extrae los datos de un PDF de propuesta firmada vía la API de Claude.
 * El PDF se procesa en memoria, no se persiste.
 */
export async function extractProposal(
  pdfBytes: Buffer,
  catalog: ServiceCatalogItem[]
): Promise<ProposalExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta la variable de entorno ANTHROPIC_API_KEY — no se puede extraer la propuesta."
    );
  }

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 4096,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          // Bloque estable (instrucciones + catálogo) → cacheado.
          {
            type: "text",
            text: buildInstructions(catalog),
            cache_control: { type: "ephemeral" },
          },
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBytes.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Analiza el PDF anterior y registra los datos con la herramienta.",
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("El modelo no devolvió datos estructurados de la propuesta.");
  }
  return parseExtractionResponse(toolUse.input, catalog);
}
