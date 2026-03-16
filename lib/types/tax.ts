export interface TaxModel {
  id: string;
  year: number;
  quarter: number;
  model_code: string;
  description: string | null;
  display_order: number;
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
  company_name: string | null;
  nif: string | null;
}

export interface EntryPayload {
  tax_model_id: string;
  company_id: string;
  amount: number;
  entry_type: "pagar" | "percibir";
}
