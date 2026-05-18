import { describe, it, expect } from "vitest";
import { normalizeNif, looksLikeValidNif } from "./nif";

describe("normalizeNif", () => {
  it("pone en mayúsculas", () => {
    expect(normalizeNif("b12345678")).toBe("B12345678");
  });

  it("quita espacios, puntos y guiones", () => {
    expect(normalizeNif(" b-12.345.678 ")).toBe("B12345678");
  });

  it("es idempotente", () => {
    const once = normalizeNif("b-12.345.678");
    expect(normalizeNif(once)).toBe(once);
  });

  it("devuelve cadena vacía para entrada vacía", () => {
    expect(normalizeNif("   ")).toBe("");
  });
});

describe("looksLikeValidNif", () => {
  it("acepta un CIF bien formado", () => {
    expect(looksLikeValidNif("B12345678")).toBe(true);
  });

  it("acepta un DNI con letra", () => {
    expect(looksLikeValidNif("12345678Z")).toBe(true);
  });

  it("rechaza algo demasiado corto", () => {
    expect(looksLikeValidNif("B123")).toBe(false);
  });

  it("rechaza caracteres no alfanuméricos", () => {
    expect(looksLikeValidNif("B1234567/")).toBe(false);
  });

  it("rechaza cadena vacía", () => {
    expect(looksLikeValidNif("")).toBe(false);
  });
});
