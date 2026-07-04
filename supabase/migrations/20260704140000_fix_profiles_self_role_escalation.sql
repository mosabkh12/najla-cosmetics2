-- =============================================
-- Fix: profiles self-role-escalation
--
-- "profiles_own_update" allowed any authenticated
-- user to UPDATE their entire profiles row via the
-- client Supabase SDK — including `role` — since
-- Postgres RLS policies restrict which ROWS are
-- writable, not which COLUMNS. A user could call
-- supabase.from('profiles').update({ role: 'admin' })
-- against their own row and self-promote to admin,
-- because requireAdmin() trusts profiles.role.
--
-- Fix: remove the client's ability to UPDATE
-- profiles at all (both the permissive policy and
-- the underlying GRANT). All profile writes now go
-- exclusively through the updateProfile server
-- function, which uses the service-role client and
-- only ever touches full_name/phone.
-- =============================================

-- Drop the policy that allowed unrestricted own-row updates
DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;

-- Belt-and-suspenders: even with RLS enabled and no UPDATE policy left,
-- PostgREST/RLS already denies UPDATEs with no matching policy — but also
-- revoke the underlying grant so the operation is rejected outright,
-- matching the pattern already used for services/products/etc.
REVOKE UPDATE ON public.profiles FROM authenticated;

-- Read access to one's own profile is unaffected and remains in place:
--   CREATE POLICY "profiles_own_select" ON public.profiles
--     FOR SELECT TO authenticated USING (auth.uid() = id);
-- (from the original profiles migration — not modified here)

-- INSERT access ("profiles_own_insert") and service_role's full access
-- are also left untouched: profile creation is already handled by the
-- SECURITY DEFINER handle_new_user() trigger regardless of client grants,
-- and service_role (supabaseAdmin) needs UPDATE for admin/email-verification
-- flows in src/api/auth/signup.ts and src/api/auth/otp.ts.
