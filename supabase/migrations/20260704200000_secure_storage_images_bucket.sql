-- =============================================
-- Secure Storage: `images` bucket
--
-- Previous state (20260627220000_security_hardening.sql):
--   - images_auth_upload / images_auth_manage / images_auth_delete all
--     allowed ANY authenticated user to INSERT/UPDATE/DELETE ANY object
--     in the bucket — the WITH CHECK/USING clauses only tested
--     `bucket_id = 'images'`, with no folder restriction, no owner
--     check, and no admin check (the migration's own comment claimed
--     "Only the uploader or admin can update/delete", but the policy
--     never actually enforced that). Any signed-in customer could
--     upload arbitrary files anywhere in the bucket, or overwrite/
--     delete existing product/service/site images.
--   - The bucket's allowed_mime_types included image/gif and video/mp4,
--     neither of which the app ever renders (every image field is
--     displayed as a plain <img>, never <video>).
--   - The only real upload path (src/routes/admin.settings.tsx, hero/
--     about images) called supabase.storage.from("images").upload(...)
--     directly from the browser using the user's own session, relying
--     entirely on the (broken) RLS policies above for protection.
--
-- Fix: admin image uploads now go exclusively through the
-- requireAdmin-protected uploadAdminImage server function (src/api/
-- storage/storage.ts), which uses supabaseAdmin (service_role) — the
-- service_role bypasses storage RLS entirely, the same way it bypasses
-- table RLS. Direct browser writes to storage.objects for this bucket
-- are revoked; only public read access remains.
-- =============================================


-- ═══════════════════════════════════════════════
-- 1. Tighten allowed MIME types to what the app actually needs.
--    Bucket stays public — product/service/site images are legitimately
--    public and are read via plain public URLs across the whole site.
-- ═══════════════════════════════════════════════

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'images';


-- ═══════════════════════════════════════════════
-- 2. REMOVE the broad authenticated write policies.
--    No replacement authenticated write policy is added: every upload
--    now goes through uploadAdminImage (requireAdmin + supabaseAdmin),
--    which bypasses RLS as service_role. Public read is untouched.
-- ═══════════════════════════════════════════════

DROP POLICY IF EXISTS "images_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "images_auth_manage" ON storage.objects;
DROP POLICY IF EXISTS "images_auth_delete" ON storage.objects;
