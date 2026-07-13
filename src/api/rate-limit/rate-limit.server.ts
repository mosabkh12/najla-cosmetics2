import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Server-only. Never import this from client code.

// Fixed-window rate limiting backed by the `rate_limits` Postgres table
// and `check_rate_limit` RPC (see the accompanying migration). State
// lives in the database rather than in-process memory because this app
// runs as stateless serverless functions on Vercel — an in-memory
// counter would reset on every cold start and wouldn't be shared across
// concurrent instances, making it unreliable as an abuse guard.

// Vercel's edge network sets x-forwarded-for on every request that
// reaches a Server Function, so getRequestIP({ xForwardedFor: true })
// covers the normal case. The extra header checks are a defensive
// fallback for proxies/CDNs (e.g. Cloudflare) that use a different
// header, or a local/dev environment where neither is set.
export function getClientIp(): string {
  const direct = getRequestIP({ xForwardedFor: true });
  if (direct) return direct;

  const forwardedFor = getRequestHeader("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  const realIp = getRequestHeader("x-real-ip");
  if (realIp) return realIp;

  const cfConnectingIp = getRequestHeader("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  return "unknown";
}

export class RateLimitError extends Error {
  constructor() {
    super("RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

// Throws RateLimitError (never a raw/technical error) once `identifier`
// has made more than `max` calls to `action` within `windowSeconds`.
// Fails open (logs and allows the request) if the rate-limit check
// itself errors, so an infra hiccup never blocks legitimate users.
export async function enforceRateLimit(params: {
  action: string;
  identifier: string;
  windowSeconds: number;
  max: number;
}): Promise<void> {
  const { action, identifier, windowSeconds, max } = params;
  const key = `${action}:${identifier}`;

  const { data: allowed, error } = await supabaseAdmin.rpc("check_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max_count: max,
  });

  if (error) {
    console.error("[rate-limit] check failed, failing open", action, error);
    return;
  }

  if (!allowed) throw new RateLimitError();
}
