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
  } | null;
}

export interface Company {
  id: string;
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  canEdit?: boolean; // true si el usuario puede modificar esta empresa
}

export interface EntryPayload {
  tax_model_id: string;
  company_id: string;
  amount: number;
  entry_type: "pagar" | "percibir";
}

export interface TaxEntryForClient {
  id: string;
  tax_model_id: string;
  model_code: string;
  description: string | null;
  amount: number;
  entry_type: "pagar" | "percibir";
  is_informative: boolean;
  client_response: {
    approved: boolean;
    bank_account_id: string;
  } | null;
}

export interface TaxClientResponsePayload {
  tax_entry_id: string;
  bank_account_id: string | null;
  approved: boolean;
}
