-- =============================================
-- Secure OTP + Signup Verification Flow
--
-- Previous flow (src/api/auth/otp.ts, src/api/auth/signup.ts):
--   - verification_otps stored the raw 6-digit code in plaintext.
--   - verifyOtp proved OTP possession server-side, but adminSignUp was
--     a completely independent server function that never checked
--     whether OTP verification had actually happened for that email —
--     it could be called directly (bypassing the UI) to create a
--     fully email_confirm:true, profiles.email_verified:true account
--     for any email/password with no OTP at all.
--   - verifyOtp used a SELECT-then-UPDATE pattern to mark an OTP used,
--     which is not atomic: two concurrent requests with the same valid
--     code could both pass the SELECT before either UPDATE landed.
--   - No resend cooldown, no hourly send cap, no failed-attempt lockout.
--
-- Fix: verifyOtp now issues a short-lived, single-use signup
-- verification token (only its hash is stored) after a real OTP is
-- atomically claimed. adminSignUp requires that token, atomically
-- claims it against the same email, and only then creates the Supabase
-- Auth user. OTPs are stored as HMAC hashes, not plaintext.
-- =============================================


-- ═══════════════════════════════════════════════
-- 1. REBUILD verification_otps: hashed codes, atomic single-use claim,
--    per-row failed-attempt tracking
-- ═══════════════════════════════════════════════

ALTER TABLE public.verification_otps
  ADD COLUMN IF NOT EXISTS otp_hash TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

-- Any pending plaintext codes are invalidated by this migration rather
-- than migrated — they're short-lived (10 min) and re-requestable.
DELETE FROM public.verification_otps;

ALTER TABLE public.verification_otps ALTER COLUMN otp_hash SET NOT NULL;
ALTER TABLE public.verification_otps DROP COLUMN IF EXISTS otp;
ALTER TABLE public.verification_otps DROP COLUMN IF EXISTS used;

CREATE INDEX IF NOT EXISTS idx_otps_email_created ON public.verification_otps(email, created_at DESC);

-- Defense-in-depth: explicit, even though no anon/authenticated grants
-- or policies have ever existed on this table.
REVOKE ALL ON public.verification_otps FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.verification_otps TO service_role;


-- ═══════════════════════════════════════════════
-- 2. signup_verification_tokens
--    Proof that a given email just completed OTP verification.
--    Single-use, short-lived (10 min), server-only.
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.signup_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_tokens_email ON public.signup_verification_tokens(email);
CREATE INDEX IF NOT EXISTS idx_signup_tokens_expires ON public.signup_verification_tokens(expires_at);

ALTER TABLE public.signup_verification_tokens ENABLE ROW LEVEL SECURITY;
-- No RLS policies for anon/authenticated — only service_role (which
-- bypasses RLS) may read or write this table.
REVOKE ALL ON public.signup_verification_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.signup_verification_tokens TO service_role;


-- ═══════════════════════════════════════════════
-- 3. EXTEND CLEANUP to cover signup_verification_tokens too
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.verification_otps
  WHERE expires_at < (now() - interval '1 hour');
  DELETE FROM public.signup_verification_tokens
  WHERE expires_at < (now() - interval '1 hour');
  RETURN NEW;
END; $$;
