-- =============================================
-- Rate limiting / anti-abuse storage
--
-- Backs a reusable server-side rate limiter
-- (src/api/rate-limit/rate-limit.server.ts) used by Server Functions
-- that were previously unthrottled: OTP send/verify, email/phone
-- availability checks, booking availability lookups, appointment/
-- order creation, and admin image uploads.
--
-- Design: fixed-window counter. Each check buckets the current time
-- into a window of p_window_seconds and atomically increments a
-- per-(key, window) counter via INSERT ... ON CONFLICT DO UPDATE,
-- which Postgres serializes per row — safe under concurrent requests
-- across multiple serverless instances on Vercel, unlike an
-- in-process in-memory counter (which resets per cold start and isn't
-- shared across concurrent lambda instances, so it would be
-- unreliable here).
--
-- Only ever accessed via check_rate_limit() using the service-role
-- client (supabaseAdmin) from Server Functions — never from the
-- browser — so RLS is enabled with no policies (default deny) and
-- all direct table grants are withheld from anon/authenticated.
-- =============================================

CREATE TABLE public.rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: default-deny for anon/authenticated. Only supabaseAdmin
-- (service_role, which bypasses RLS) reaches this table, via the
-- SECURITY DEFINER function below.
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

-- Speeds up the opportunistic cleanup below (deleting old windows).
CREATE INDEX rate_limits_window_start_idx ON public.rate_limits (window_start);


-- ═══════════════════════════════════════════════
-- check_rate_limit RPC
--   p_key            caller-defined bucket, e.g. "otp_send:ip:1.2.3.4"
--                     or "create_order:user:<uuid>"
--   p_window_seconds fixed-window length in seconds
--   p_max_count      max allowed calls per window for this key
--   returns true if this call is within the limit (and records it),
--   false if the limit has already been exceeded for this window.
--
--   Also opportunistically deletes this key's own expired windows
--   (older than 3x the current window length) on every call, so the
--   table self-cleans without a separate cron job — bounded to a
--   handful of rows per distinct key at any time.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_window_seconds INTEGER,
  p_max_count INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;

  DELETE FROM public.rate_limits
  WHERE key = p_key
    AND window_start < v_window_start - (p_window_seconds * 3) * INTERVAL '1 second';

  RETURN v_count <= p_max_count;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
