// Validación común para uploads a Storage (admin y cliente).
//
// Confiar en `mimeType` y `fileName` que llegan del cliente es peligroso: el
// cliente puede declarar `text/html` con extensión `.pdf.html`, o subir un
// archivo enorme para abusar de la cuota. Esta validación se ejecuta SIEMPRE
// en el server antes de tocar el bucket.
//
// La descarga de archivos del cliente fuerza `Content-Disposition: attachment`
// (ver `getDocumentationSignedUrl`), por lo que un HTML enmascarado no llegaría
// a ejecutarse en el navegador. Aun así, validamos para no almacenar contenido
// arbitrario.

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

// mime → extensiones permitidas para ese mime. Si el cliente declara un mime y
// el `fileName` no termina con una de las extensiones, rechazamos.
const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heif"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/vnd.ms-powerpoint": ["ppt"],
  "application/vnd.oasis.opendocument.text": ["odt"],
  "application/vnd.oasis.opendocument.spreadsheet": ["ods"],
  "application/zip": ["zip"],
  "application/x-zip-compressed": ["zip"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
};

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

/**
 * Valida un upload contra la allowlist de mime y el tamaño máximo. Lanza si
 * hay algún problema. No devuelve nada — úsala como guard.
 */
export function validateUpload(input: {
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}): void {
  if (input.sizeBytes <= 0) {
    throw new Error("Archivo vacío");
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    throw new Error("El archivo supera el tamaño máximo (25 MB)");
  }
  const allowedExts = MIME_TO_EXTENSIONS[input.mimeType];
  if (!allowedExts) {
    throw new Error(`Tipo de archivo no permitido: ${input.mimeType}`);
  }
  const ext = extensionOf(input.fileName);
  if (!ext || !allowedExts.includes(ext)) {
    throw new Error(
      `La extensión .${ext || "(sin)"} no coincide con el tipo declarado ${input.mimeType}`
    );
  }
}
