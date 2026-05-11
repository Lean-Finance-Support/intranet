// Cifrado simétrico para la contraseña ENISA almacenada en
// documentation.client_apartados.form_response.
//
// Formato del ciphertext serializado: `${iv_b64}.${tag_b64}.${cipher_b64}`
//   · iv: 12 bytes aleatorios por fila (GCM)
//   · tag: 16 bytes (auth tag GCM)
//   · cipher: AES-256-GCM(plaintext)
//
// La key vive en la env `ENISA_ENCRYPTION_KEY` como 32 bytes en base64. Generar
// con: `openssl rand -base64 32` y guardar en Vercel + 1Password (sin backup en
// 1Password no hay forma de recuperar las contraseñas existentes si se pierde).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function loadKey(): Buffer {
  const raw = process.env.ENISA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENISA_ENCRYPTION_KEY no está configurada");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENISA_ENCRYPTION_KEY inválida: esperados ${KEY_BYTES} bytes (base64), encontrados ${key.length}`
    );
  }
  return key;
}

export function encryptEnisaPassword(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Contraseña vacía");
  }
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

export function decryptEnisaPassword(serialized: string): string {
  if (typeof serialized !== "string") {
    throw new Error("Ciphertext no válido");
  }
  const parts = serialized.split(".");
  if (parts.length !== 3) {
    throw new Error("Ciphertext con formato incorrecto");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const key = loadKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  if (iv.length !== IV_BYTES) {
    throw new Error("IV con longitud inválida");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
