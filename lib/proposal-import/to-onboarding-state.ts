// Mapper puro: convierte la extracción de la propuesta en el estado inicial
// parcial del wizard de onboarding. Sin IO — solo transforma.

import {
  genId,
  type OnboardingState,
} from "@/app/admin/(sidebar)/clientes/onboarding/_components/onboarding-state";
import type { ProposalExtraction } from "./types";
import { normalizeNif } from "./nif";

export function proposalToOnboardingState(
  extraction: ProposalExtraction,
  opts: { canManageBankAccounts: boolean }
): Partial<OnboardingState> {
  const fullName = `${extraction.signer.name} ${extraction.signer.surname}`.trim();

  // Solo los matches fiables se preseleccionan; los low/none se ofrecen como
  // sugerencias en el paso 2 y el comercial los elige a mano.
  const selectedServiceIds = [
    ...new Set(
      extraction.services
        .filter((s) => s.confidence === "high" && s.service_id)
        .map((s) => s.service_id as string)
    ),
  ];

  const bankAccounts =
    extraction.client_bank_account && opts.canManageBankAccounts
      ? [
          {
            id: genId(),
            iban: extraction.client_bank_account.iban,
            label: extraction.client_bank_account.label ?? "",
            bank_name: extraction.client_bank_account.bank_name ?? "",
          },
        ]
      : [];

  return {
    legal_name: extraction.company.legal_name,
    company_name: extraction.company.company_name,
    nif: normalizeNif(extraction.company.nif),
    client_accounts: [
      {
        id: genId(),
        email: extraction.signer.email,
        full_name: fullName,
        existing_profile_id: null,
      },
    ],
    bank_accounts: bankAccounts,
    selected_service_ids: selectedServiceIds,
  };
}
