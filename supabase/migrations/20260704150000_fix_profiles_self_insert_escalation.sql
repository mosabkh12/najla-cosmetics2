-- =============================================
-- Fix: profiles self-insert-escalation
--
-- Follows on from 20260704140000_fix_profiles_self_role_escalation.sql,
-- which closed the UPDATE path. The INSERT path had the same shape of
-- bug: "profiles_own_insert" only restricted which ROW an authenticated
-- user could insert (auth.uid() = id), not which COLUMNS — so if a
-- profile row didn't exist yet for a user (e.g. a race against the
-- signup trigger, or a client racing its own auth session), a client
-- could call:
--   supabase.from('profiles').insert({ id: myUserId, role: 'admin', ... })
-- and land as admin from account creation.
--
-- Profile creation does not need this policy at all: it's already fully
-- handled by the SECURITY DEFINER handle_new_user() trigger (see
-- 20260628230000_consolidate_roles_into_profiles.sql), which hardcodes
-- role = 'customer' directly in its INSERT and bypasses RLS/grants
-- entirely by virtue of running as SECURITY DEFINER. Removing the
-- client's own INSERT ability does not affect it.
-- =============================================

-- Drop the policy that allowed a client to insert their own profile row
-- with arbitrary columns
DROP POLICY IF EXISTS "profiles_own_insert" ON public.profiles;

-- Belt-and-suspenders, matching the UPDATE fix: revoke the underlying
-- grant too, so PostgREST rejects INSERT requests outright for the
-- authenticated role.
REVOKE INSERT ON public.profiles FROM authenticated;

-- service_role (used by supabaseAdmin in src/api/auth/signup.ts and
-- src/api/auth/otp.ts) keeps its unrestricted GRANT ALL from the
-- original profiles migration — untouched here — and the
-- handle_new_user() trigger runs as SECURITY DEFINER, so neither
-- depends on the authenticated role's grants at all.
