// Tipos del módulo de importación de propuestas de ventas firmadas.
//
// `ProposalExtraction` es la salida cruda del modelo (ya validada y
// post-procesada). `ImportProposalResult` es lo que la server action devuelve
// al cliente: una unión discriminada por `mode` según si el NIF ya existe.

/** Servicio del catálogo que se pasa al modelo para que mapee la propuesta. */
export interface ServiceCatalogItem {
  id: string;
  name: string;
  slug: string;
}

export interface ProposalCompany {
  /** Razón social. */
  legal_name: string;
  /** Nombre comercial (si la propuesta no lo distingue, = legal_name). */
  company_name: string;
  /** NIF/CIF tal cual aparece en el PDF (sin normalizar). */
  nif: string;
}

export interface ProposalSigner {
  name: string;
  surname: string;
  /** DNI/NIF del firmante. */
  dni: string;
  /** Email del firmante — SOLO del audit report de Adobe Acrobat Sign. */
  email: string;
}

export type ServiceConfidence = "high" | "low" | "none";

export interface ProposalServiceMatch {
  /** Texto literal de la línea del presupuesto. */
  raw_text: string;
  /** Id del catálogo si el modelo lo mapeó y existe; si no, null. */
  service_id: string | null;
  confidence: ServiceConfidence;
}

/**
 * Cuenta bancaria DEL CLIENTE (p.ej. domiciliación de pagos del cliente).
 * Nunca la cuenta de pago a Lean Finance.
 */
export interface ProposalBankAccount {
  iban: string;
  bank_name: string | null;
  label: string | null;
}

export interface ProposalExtraction {
  company: ProposalCompany;
  signer: ProposalSigner;
  services: ProposalServiceMatch[];
  /** null si la propuesta no identifica una cuenta del cliente. */
  client_bank_account: ProposalBankAccount | null;
}

/**
 * Avisos sobre el matching de servicios — para que el comercial revise lo que
 * la IA no pudo resolver con seguridad.
 */
export interface ProposalServiceWarnings {
  /** La IA mapeó la línea a un servicio pero con dudas (confidence "low"). */
  low_confidence: { raw_text: string; service_name: string }[];
  /** Líneas que no corresponden a ningún servicio del catálogo (confidence "none"). */
  unmatched: string[];
}

/** Empresa NUEVA: el NIF no existe en BD → wizard prerrellenado. */
export interface ImportProposalNew {
  mode: "new";
  extraction: ProposalExtraction;
  service_warnings: ProposalServiceWarnings;
}

/** Empresa con `deleted_at` → bloqueante, hay que restaurarla primero. */
export interface ImportProposalSoftDeleted {
  mode: "soft_deleted";
  company: { id: string; legal_name: string };
}

/** Empresa EXISTENTE activa → pantalla "añadir servicios". */
export interface ImportProposalExisting {
  mode: "existing";
  company: { id: string; legal_name: string; company_name: string | null };
  extraction: ProposalExtraction;
  /** Servicios matcheados (confidence high) que aún NO están contratados. */
  new_services: { service_id: string; name: string; raw_text: string }[];
  /** Servicios matcheados que la empresa ya tiene contratados. */
  already_contracted: { service_id: string; name: string }[];
  /** Avisos de servicios dudosos o sin match (low/none). */
  service_warnings: ProposalServiceWarnings;
  /** true si el PDF se adjuntó al apartado "Propuesta comercial" del cliente. */
  proposal_attached: boolean;
}

export type ImportProposalResult =
  | ImportProposalNew
  | ImportProposalSoftDeleted
  | ImportProposalExisting;
