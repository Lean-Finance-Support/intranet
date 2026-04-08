export const ENISA_DOCUMENT_TYPES = [
  {
    key: "acta-notarial",
    title: "Escritura de Acta Notarial de Manifestaciones sobre Titularidad Real",
    instructions:
      "Debe ser en documento aparte, no es válido que esté recogida en la escritura de constitución. Si no lo tenéis es posible que tengáis que pasar por notaría.",
    order: 1,
  },
  {
    key: "dni-socios",
    title: "DNI de los socios en PDF, NIE o Pasaporte",
    instructions:
      "Sube los documentos de identidad de todos los socios de la empresa en formato PDF.",
    order: 2,
  },
  {
    key: "nif-empresa",
    title: "Tarjeta NIF de la empresa en PDF",
    instructions: "Sube la tarjeta NIF de la empresa en formato PDF.",
    order: 3,
  },
  {
    key: "situacion-censal",
    title: "Certificado de situación censal de la Agencia Tributaria",
    instructions:
      "Importante que estéis dados de alta en el modelo 036 como empresarios. Si no lo habéis hecho, no será válido el certificado. Puedes obtenerlo en: https://www.agenciatributaria.gob.es/AEAT.sede/procedimientoini/G313.shtml",
    order: 4,
  },
  {
    key: "escrituras-constitucion",
    title: "Escrituras de Constitución inscritas en el Registro Mercantil",
    instructions:
      "Incluir posibles modificaciones originales (cambio administradores, cambio domicilio social, etc). NO VÁLIDAS COPIAS SIMPLES, solo originales o copias autorizadas.",
    order: 5,
  },
  {
    key: "avance-contable",
    title: "Avance contable del ejercicio en curso",
    instructions:
      "Firmado por el administrador. Debe incluir PyG (Pérdidas y Ganancias) y Balance.",
    order: 6,
  },
  {
    key: "cuentas-anuales",
    title: "Cuentas Anuales Presentadas en Registro Mercantil",
    instructions:
      "SOLO para empresas con más de un año desde su constitución. Si la empresa tiene menos de un año, puedes omitir este apartado.",
    order: 7,
  },
  {
    key: "corriente-hacienda",
    title: "Certificado de estar al corriente con Hacienda",
    instructions:
      "Certificado emitido por la Agencia Tributaria que acredite que la empresa está al corriente de sus obligaciones tributarias.",
    order: 8,
  },
  {
    key: "corriente-ss",
    title: "Certificado de estar al corriente con la Seguridad Social",
    instructions:
      "Certificado emitido por la Tesorería General de la Seguridad Social.",
    order: 9,
  },
  {
    key: "declaracion-responsable",
    title: "Modelo de declaración responsable",
    instructions:
      "Firmado con certificado digital por el administrador/a de la empresa.",
    order: 10,
  },
  {
    key: "informe-cirbe",
    title: "Informe CIRBE",
    instructions:
      "Informe de la Central de Información de Riesgos del Banco de España.",
    order: 11,
  },
  {
    key: "alta-enisa",
    title: "Alta en el portal de ENISA",
    instructions:
      "Daros de alta en https://portaldelcliente.enisa.es:8443/web/clientes/alta-solicitud y compartid las credenciales para que podamos gestionar la solicitud.",
    order: 12,
    isCredentials: true,
  },
] as const;

export type EnisaDocumentTypeKey =
  (typeof ENISA_DOCUMENT_TYPES)[number]["key"];

export type EnisaBoxStatus =
  | "draft"
  | "submitted"
  | "validated"
  | "rejected";

export interface EnisaDocument {
  id: string;
  company_id: string;
  document_type_key: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  is_submitted: boolean;
  uploaded_by: string;
  created_at: string;
}

export interface EnisaBoxReview {
  id: string;
  company_id: string;
  document_type_key: string;
  status: "submitted" | "validated" | "rejected";
  rejection_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface EnisaCredentials {
  company_id: string;
  username: string;
  password: string;
  is_submitted: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface EnisaBoxData {
  typeKey: EnisaDocumentTypeKey;
  title: string;
  instructions: string;
  order: number;
  isCredentials: boolean;
  documents: EnisaDocument[];
  review: EnisaBoxReview | null;
  credentials?: EnisaCredentials | null;
  status: EnisaBoxStatus;
}

export function computeBoxStatus(
  review: EnisaBoxReview | null,
  hasSubmittedDocs: boolean,
): EnisaBoxStatus {
  if (review?.status === "validated") return "validated";
  if (review?.status === "rejected") return "rejected";
  if (review?.status === "submitted" || hasSubmittedDocs) return "submitted";
  return "draft";
}
