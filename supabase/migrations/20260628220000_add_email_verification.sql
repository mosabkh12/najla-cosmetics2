-- =============================================
-- Email Verification Migration
-- Adds: email + email_verified to profiles,
--        verification_otps table,
--        updated handle_new_user trigger
-- =============================================

-- ═══════════════════════════════════════════════
-- 1. ADD email & email_verified TO profiles
-- ═══════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Backfill email from auth.users for existing rows
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;


-- ═══════════════════════════════════════════════
-- 2. UPDATE handle_new_user TO STORE email
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;


-- ═══════════════════════════════════════════════
-- 3. CREATE verification_otps TABLE
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.verification_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only service_role accesses this table (via supabaseAdmin)
GRANT ALL ON public.verification_otps TO service_role;

ALTER TABLE public.verification_otps ENABLE ROW LEVEL SECURITY;

-- No RLS policies for anon/authenticated — only service_role bypasses RLS

CREATE INDEX IF NOT EXISTS idx_otps_email ON public.verification_otps(email);
CREATE INDEX IF NOT EXISTS idx_otps_expires ON public.verification_otps(expires_at);


-- ═══════════════════════════════════════════════
-- 4. AUTO-CLEANUP EXPIRED OTPs (optional)
--    Keeps the table small over time.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.verification_otps
  WHERE expires_at < (now() - interval '1 hour');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS cleanup_otps_on_insert ON public.verification_otps;
CREATE TRIGGER cleanup_otps_on_insert
  AFTER INSERT ON public.verification_otps
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_expired_otps();

REVOKE ALL ON FUNCTION public.cleanup_expired_otps() FROM PUBLIC, anon, authenticated;
