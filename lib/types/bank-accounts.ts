export interface CompanyBankAccount {
  id: string;
  company_id: string;
  iban: string;
  bank_name: string | null;
  label: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
