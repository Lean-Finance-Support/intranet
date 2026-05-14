/**
 * Normalización y validación de DNI/NIE españoles.
 *
 * - DNI: 8 dígitos + letra.
 * - NIE: X/Y/Z + 7 dígitos + letra.
 * - Normalización: upper case, sin espacios, sin guiones.
 */

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const NIE_PREFIXES: Record<string, string> = { X: "0", Y: "1", Z: "2" };

export function normalizeDni(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isValidDni(input: string): boolean {
  const dni = normalizeDni(input);
  if (!/^[XYZ]?\d{7,8}[A-Z]$/.test(dni)) return false;

  let numericPart = dni.slice(0, -1);
  const letter = dni.slice(-1);

  // NIE → reemplazar prefijo por dígito.
  if (/^[XYZ]/.test(numericPart)) {
    const prefix = numericPart[0];
    numericPart = NIE_PREFIXES[prefix] + numericPart.slice(1);
  }

  if (numericPart.length !== 8) return false;
  const number = parseInt(numericPart, 10);
  if (!Number.isFinite(number)) return false;
  const expectedLetter = DNI_LETTERS[number % 23];
  return expectedLetter === letter;
}

/**
 * Devuelve el DNI normalizado si es válido; lanza si no.
 * Usar en server actions tras recibir input de form.
 */
export function parseDniOrThrow(input: string): string {
  const dni = normalizeDni(input);
  if (!isValidDni(dni)) {
    throw new Error("DNI/NIE inválido");
  }
  return dni;
}
