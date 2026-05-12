// Verificación compartida de `x-webhook-secret` para edge functions invocadas
// desde triggers de pg_net o desde server actions del Next. Comparación
// timing-safe para evitar ataques side-channel (defensa en profundidad — el
// secret es de 256 bits, pero conviene tener una sola implementación común).
//
// Uso desde una edge function:
//
//   import { verifyWebhookSecret } from "../_shared/verify-webhook-secret.ts";
//
//   Deno.serve(async (req) => {
//     const unauthorized = verifyWebhookSecret(req);
//     if (unauthorized) return unauthorized;
//     // ... resto
//   });

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function verifyWebhookSecret(req: Request): Response | null {
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!WEBHOOK_SECRET || !timingSafeEqual(provided, WEBHOOK_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
