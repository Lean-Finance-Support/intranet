/**
 * Rate-limit para el endpoint público del formulario de la renta.
 *
 * Backed por la tabla `renta.rate_limit`. Servimos las consultas con
 * service_role (RLS no permite acceso desde JWT alguno).
 *
 * Cada llamada:
 *   1. Borra filas anteriores a 1 hora.
 *   2. Cuenta eventos del actor (IP o token) en la ventana solicitada.
 *   3. Si supera el límite, devuelve false.
 *   4. Si pasa, INSERTa el nuevo evento.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitAction = "verify_dni" | "submit";

export interface RateLimitOptions {
  ip: string | null;
  token: string;
  action: RateLimitAction;
  /** Ventana en segundos. */
  windowSec: number;
  /** Máximo de eventos permitidos en la ventana. */
  maxByIp: number;
  /** Máximo por token en la misma ventana. */
  maxByToken?: number;
}

export async function checkAndRecord(
  client: SupabaseClient,
  opts: RateLimitOptions,
): Promise<boolean> {
  const supabase = client.schema("renta");
  const cutoff = new Date(Date.now() - opts.windowSec * 1000).toISOString();

  // Limpieza ocasional (no transaccional, best-effort).
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  void supabase.from("rate_limit").delete().lt("ts", oneHourAgo);

  // Conteo por IP.
  if (opts.ip) {
    const { count: ipCount } = await supabase
      .from("rate_limit")
      .select("id", { count: "exact", head: true })
      .eq("ip", opts.ip)
      .eq("action", opts.action)
      .gte("ts", cutoff);
    if ((ipCount ?? 0) >= opts.maxByIp) return false;
  }

  // Conteo por token (si aplica).
  if (opts.maxByToken !== undefined) {
    const { count: tokenCount } = await supabase
      .from("rate_limit")
      .select("id", { count: "exact", head: true })
      .eq("token", opts.token)
      .eq("action", opts.action)
      .gte("ts", cutoff);
    if ((tokenCount ?? 0) >= opts.maxByToken) return false;
  }

  // Registrar el evento.
  await supabase.from("rate_limit").insert({
    ip: opts.ip,
    token: opts.token,
    action: opts.action,
  });

  return true;
}
