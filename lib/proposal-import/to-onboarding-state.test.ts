import { describe, it, expect } from "vitest";
import { proposalToOnboardingState } from "./to-onboarding-state";
import type { ProposalExtraction } from "./types";

function baseExtraction(): ProposalExtraction {
  return {
    company: {
      legal_name: "Tracsia Capital SL",
      company_name: "Tracsia",
      nif: "b-12.345.678",
    },
    signer: {
      name: "Ana",
      surname: "García López",
      dni: "12345678Z",
      email: "ana@tracsia.es",
    },
    services: [
      { raw_text: "Servicio Solicitud ENISA", service_id: "svc-enisa", confidence: "high" },
      { raw_text: "Asesoría puntual", service_id: "svc-aseso", confidence: "low" },
      { raw_text: "Algo raro", service_id: null, confidence: "none" },
    ],
    client_bank_account: null,
  };
}

describe("proposalToOnboardingState", () => {
  it("mapea empresa con NIF normalizado", () => {
    const s = proposalToOnboardingState(baseExtraction(), { canManageBankAccounts: true });
    expect(s.legal_name).toBe("Tracsia Capital SL");
    expect(s.company_name).toBe("Tracsia");
    expect(s.nif).toBe("B12345678");
  });

  it("crea una cuenta asociada con el nombre del firmante unido", () => {
    const s = proposalToOnboardingState(baseExtraction(), { canManageBankAccounts: true });
    expect(s.client_accounts).toHaveLength(1);
    expect(s.client_accounts![0].email).toBe("ana@tracsia.es");
    expect(s.client_accounts![0].full_name).toBe("Ana García López");
    expect(s.client_accounts![0].existing_profile_id).toBeNull();
  });

  it("preselecciona solo los servicios con confidence high", () => {
    const s = proposalToOnboardingState(baseExtraction(), { canManageBankAccounts: true });
    expect(s.selected_service_ids).toEqual(["svc-enisa"]);
  });

  it("deduplica service_ids repetidos", () => {
    const e = baseExtraction();
    e.services.push({ raw_text: "ENISA otra vez", service_id: "svc-enisa", confidence: "high" });
    const s = proposalToOnboardingState(e, { canManageBankAccounts: true });
    expect(s.selected_service_ids).toEqual(["svc-enisa"]);
  });

  it("incluye la cuenta bancaria si hay client_bank_account y permiso", () => {
    const e = baseExtraction();
    e.client_bank_account = { iban: "ES7620770024003102575766", bank_name: "Santander", label: null };
    const s = proposalToOnboardingState(e, { canManageBankAccounts: true });
    expect(s.bank_accounts).toHaveLength(1);
    expect(s.bank_accounts![0].iban).toBe("ES7620770024003102575766");
    expect(s.bank_accounts![0].bank_name).toBe("Santander");
    expect(s.bank_accounts![0].label).toBe("");
  });

  it("omite la cuenta bancaria sin permiso aunque exista", () => {
    const e = baseExtraction();
    e.client_bank_account = { iban: "ES7620770024003102575766", bank_name: null, label: null };
    const s = proposalToOnboardingState(e, { canManageBankAccounts: false });
    expect(s.bank_accounts).toEqual([]);
  });

  it("deja bank_accounts vacío si no hay cuenta del cliente", () => {
    const s = proposalToOnboardingState(baseExtraction(), { canManageBankAccounts: true });
    expect(s.bank_accounts).toEqual([]);
  });
});
