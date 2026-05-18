// Normalización de NIF/CIF. Misma convención que `finalizeOnboarding`
// (trim + upper) pero además quita separadores que un PDF puede incluir
// (puntos, guiones, espacios) para que la búsqueda por NIF no falle por formato.

export function normalizeNif(raw: string): string {
  return raw.toUpperCase().replace(/[\s.\-]/g, "");
}

/**
 * Chequeo ligero de forma — solo para decidir si mostrar un aviso. No valida el
 * dígito de control. Un NIF/CIF/NIE español normalizado tiene 9 caracteres
 * alfanuméricos; dejamos margen 8-10 por si el OCR pierde o añade uno.
 */
export function looksLikeValidNif(nif: string): boolean {
  return /^[A-Z0-9]{8,10}$/.test(nif);
}
