// Helpers para el bucket "client-documentation". El path sigue la convención
// {company_id}/{client_apartado_id}/{file_id}/{filename} — exigida por las
// policies de storage (ver supabase/migrations/20260428100200_*.sql).

export const DOCUMENTATION_BUCKET = "client-documentation";

const SAFE_FILENAME_RE = /[^A-Za-z0-9._-]/g;

/**
 * Sanitiza un nombre de archivo para usarlo en el path del bucket. Mantiene
 * extensión, sustituye espacios y caracteres no ASCII por "_".
 */
export function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "archivo";
  return trimmed.replace(SAFE_FILENAME_RE, "_");
}

/** Construye el path final dentro del bucket. */
export function buildDocumentationStoragePath(params: {
  companyId: string;
  clientApartadoId: string;
  fileId: string;
  fileName: string;
}): string {
  const safe = sanitizeFileName(params.fileName);
  return `${params.companyId}/${params.clientApartadoId}/${params.fileId}/${safe}`;
}

/** Path para plantillas del catálogo: templates/{apartado_id}/{template_id}/{filename} */
export function buildTemplateStoragePath(params: {
  apartadoId: string;
  templateId: string;
  fileName: string;
}): string {
  const safe = sanitizeFileName(params.fileName);
  return `templates/${params.apartadoId}/${params.templateId}/${safe}`;
}

export interface SignedUrlClient {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
        opts?: { download?: string | boolean }
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
}

/**
 * Firma una URL de descarga (TTL corto). Pasa el cliente Supabase ya creado
 * (admin o ssr) — el helper no lo crea para evitar dependencias en su capa.
 */
export async function getDocumentationSignedUrl(
  supabase: SignedUrlClient,
  storagePath: string,
  fileName?: string,
  expiresInSeconds = 60
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTATION_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds, {
      download: fileName ?? true,
    });
  if (error || !data) {
    throw new Error("No se pudo firmar la descarga del archivo");
  }
  return data.signedUrl;
}
