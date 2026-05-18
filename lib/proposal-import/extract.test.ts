import { describe, it, expect } from "vitest";
import { parseExtractionResponse, extractProposal } from "./extract";
import type { ServiceCatalogItem } from "./types";

const CATALOG: ServiceCatalogItem[] = [
  { id: "svc-enisa", name: "Préstamo ENISA", slug: "prestamo-enisa" },
  { id: "svc-conta", name: "Contabilidad", slug: "contabilidad" },
];

function modelOutput() {
  return {
    company: {
      legal_name: "Tracsia Capital SL",
      company_name: "Tracsia",
      nif: "B12345678",
    },
    signer: {
      name: "Ana",
      surname: "García",
      dni: "12345678Z",
      email: "ana@tracsia.es",
    },
    services: [
      { raw_text: "Servicio Solicitud ENISA", service_id: "svc-enisa", confidence: "high" },
      { raw_text: "Contabilidad mensual", service_id: "svc-conta", confidence: "high" },
    ],
    client_bank_account: null,
  };
}

describe("parseExtractionResponse", () => {
  it("parsea una respuesta bien formada", () => {
    const r = parseExtractionResponse(modelOutput(), CATALOG);
    expect(r.company.legal_name).toBe("Tracsia Capital SL");
    expect(r.signer.email).toBe("ana@tracsia.es");
    expect(r.services).toHaveLength(2);
    expect(r.services[0].service_id).toBe("svc-enisa");
    expect(r.client_bank_account).toBeNull();
  });

  it("degrada a confidence none un service_id que no existe en el catálogo", () => {
    const out = modelOutput();
    out.services[0].service_id = "svc-inventado";
    const r = parseExtractionResponse(out, CATALOG);
    expect(r.services[0].service_id).toBeNull();
    expect(r.services[0].confidence).toBe("none");
  });

  it("degrada a none un match high sin service_id", () => {
    const out = modelOutput();
    out.services[0].service_id = null as unknown as string;
    const r = parseExtractionResponse(out, CATALOG);
    expect(r.services[0].confidence).toBe("none");
  });

  it("conserva la cuenta bancaria del cliente cuando viene", () => {
    const out = modelOutput();
    out.client_bank_account = {
      iban: "ES7620770024003102575766",
      bank_name: "Santander",
      label: "Domiciliación",
    } as unknown as null;
    const r = parseExtractionResponse(out, CATALOG);
    expect(r.client_bank_account?.iban).toBe("ES7620770024003102575766");
  });

  it("trata una cuenta bancaria sin IBAN como null", () => {
    const out = modelOutput();
    out.client_bank_account = { iban: "", bank_name: "BBVA", label: null } as unknown as null;
    const r = parseExtractionResponse(out, CATALOG);
    expect(r.client_bank_account).toBeNull();
  });

  it("rellena con cadenas vacías los campos ausentes", () => {
    const r = parseExtractionResponse({ services: [] }, CATALOG);
    expect(r.company.legal_name).toBe("");
    expect(r.signer.email).toBe("");
    expect(r.services).toEqual([]);
  });

  it("lanza error claro si la respuesta no es un objeto", () => {
    expect(() => parseExtractionResponse(null, CATALOG)).toThrow();
    expect(() => parseExtractionResponse("texto", CATALOG)).toThrow();
  });
});

describe("extractProposal", () => {
  it("lanza un error claro si falta ANTHROPIC_API_KEY", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(extractProposal(Buffer.from("x"), CATALOG)).rejects.toThrow(
        /ANTHROPIC_API_KEY/
      );
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});
