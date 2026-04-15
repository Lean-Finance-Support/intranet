export type TaxModelStatus = "pending" | "accepted" | "rejected";

export interface TaxModel {
  id: string;
  year: number;
  quarter: number;
  model_code: string;
  description: string | null;
  display_order: number;
  is_informative: boolean;
}

export interface TaxEntry {
  id: string;
  company_id: string;
  tax_model_id: string;
  amount: number;
  entry_type: "pagar" | "percibir";
  filled_by: string;
  deferment_allowed: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaxNotification {
  id: string;
  company_id: string;
  year: number;
  quarter: number;
  notified_by: string;
  notified_at: string;
}

export interface TaxModelWithEntry extends TaxModel {
  entry: {
    amount: number;
    entry_type: "pagar" | "percibir";
    deferment_allowed: boolean;
  } | null;
}

export interface Company {
  id: string;
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  canEdit?: boolean;    // true si el usuario puede modificar esta empresa (chief=todas, técnico=solo asignadas)
  isAssigned?: boolean; // true si el usuario está asignado como técnico de esta empresa
}

export interface EntryPayload {
  tax_model_id: string;
  company_id: string;
  amount: number;
  entry_type: "pagar" | "percibir";
  deferment_allowed?: boolean;
}

export interface DefermentRequest {
  num_installments: number;
  first_payment_date: string;
}

export interface TaxEntryForClient {
  id: string;
  tax_model_id: string;
  model_code: string;
  description: string | null;
  amount: number;
  entry_type: "pagar" | "percibir";
  is_informative: boolean;
  deferment_allowed: boolean;
  client_response: {
    status: TaxModelStatus;
    bank_account_id: string;
    deferment_requested: boolean;
    deferment_num_installments: number | null;
    deferment_first_payment_date: string | null;
  } | null;
}

export interface TaxClientResponsePayload {
  tax_entry_id: string;
  bank_account_id: string | null;
  status: TaxModelStatus;
  deferment_requested?: boolean;
  deferment_num_installments?: number | null;
  deferment_first_payment_date?: string | null;
}
