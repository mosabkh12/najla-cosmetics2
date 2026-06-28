-- =============================================
-- Consolidate user_roles into profiles
-- Single table for all user data.
-- Deleting a profile also removes the auth user.
-- =============================================

-- ═══════════════════════════════════════════════
-- 1. ADD role COLUMN TO profiles
-- ═══════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'customer';

-- Migrate existing roles from user_roles → profiles
UPDATE public.profiles p
SET role = ur.role
FROM public.user_roles ur
WHERE p.id = ur.user_id AND ur.role = 'admin';


-- ═══════════════════════════════════════════════
-- 2. UPDATE has_role TO READ FROM profiles
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role) $$;


-- ═══════════════════════════════════════════════
-- 3. UPDATE handle_new_user — set role in profiles
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.email,
    'customer'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;
  RETURN NEW;
END; $$;


-- ═══════════════════════════════════════════════
-- 4. CASCADE DELETE: profile → auth.users
--    When you delete a row from profiles,
--    the auth user is automatically removed.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_auth_user_on_profile_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS on_profile_deleted ON public.profiles;
CREATE TRIGGER on_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_auth_user_on_profile_delete();

REVOKE ALL ON FUNCTION public.delete_auth_user_on_profile_delete() FROM PUBLIC, anon, authenticated;


-- ═══════════════════════════════════════════════
-- 5. DROP user_roles TABLE
-- ═══════════════════════════════════════════════

DROP INDEX IF EXISTS idx_user_roles_user_id;

DROP POLICY IF EXISTS "user_roles_own_select" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_delete" ON public.user_roles;

DROP TABLE IF EXISTS public.user_roles;


-- ═══════════════════════════════════════════════
-- 6. INDEX on profiles.role
-- ═══════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
