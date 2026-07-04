-- =============================================
-- Final RLS/Grants Audit: remaining app tables
--
-- Findings (see the accompanying report for the full before/after
-- matrix): products, services, business_settings, product_images, and
-- appointment_slots already had INSERT/UPDATE/DELETE revoked from
-- `authenticated` back in 20260627220000_security_hardening.sql, and
-- availability_settings was created with only a SELECT grant from the
-- start (20260629220000_availability_settings.sql) — so none of these
-- tables have ever been directly writable by a browser session. All
-- admin writes already go exclusively through requireAdmin-protected
-- Server Functions using supabaseAdmin (service_role, which bypasses
-- RLS entirely and needs no policy to write).
--
-- What's left to fix is hygiene, not a live hole: five tables still
-- carry a `*_admin_write` RLS policy (FOR ALL TO authenticated, gated
-- on has_role(..., 'admin')) left over from before the GRANTs were
-- revoked. With no INSERT/UPDATE/DELETE grant behind them, Postgres
-- rejects those operations at the privilege-check stage before RLS is
-- even evaluated, so these policies are already fully inert. They're
-- removed here anyway: an inert "authenticated admin can write"
-- policy is a landmine — if a future migration ever re-grants
-- INSERT/UPDATE/DELETE to `authenticated` on one of these tables
-- without also reviewing this policy, it would silently reactivate.
-- Deleting the dead policy removes that risk entirely; admin writes
-- are completely unaffected since they never relied on it.
--
-- favorites is intentionally left untouched: favorites_own_all
-- (USING/WITH CHECK auth.uid() = user_id) is a correctly-scoped
-- per-owner policy backing a genuine customer self-service feature
-- (toggleFavorite/getUserFavorites use context.supabase, the
-- RLS-bound user client) — this is a documented, safe exception to
-- "no direct browser writes," not a gap.
-- =============================================


-- ═══════════════════════════════════════════════
-- 1. DROP vestigial admin-write policies with no backing grant.
-- ═══════════════════════════════════════════════

DROP POLICY IF EXISTS "services_admin_write" ON public.services;
DROP POLICY IF EXISTS "products_admin_write" ON public.products;
DROP POLICY IF EXISTS "product_images_admin_write" ON public.product_images;
DROP POLICY IF EXISTS "slots_admin_write" ON public.appointment_slots;
DROP POLICY IF EXISTS "business_settings_admin_write" ON public.business_settings;


-- ═══════════════════════════════════════════════
-- 2. Explicit, defensive re-statement of the write lockdown.
--    Redundant with 20260627220000_security_hardening.sql today, but
--    stated explicitly here — matching this project's established
--    pattern — so the intent is unambiguous and self-documenting
--    regardless of what future migrations do.
-- ═══════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE ON public.products FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.services FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.business_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.product_images FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.appointment_slots FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.availability_settings FROM authenticated;
