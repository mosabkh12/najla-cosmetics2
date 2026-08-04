-- =============================================
-- Phase 5: business_settings singleton integrity
--
-- business_settings was always intended to hold exactly one row (its
-- own original table comment calls it "singleton-ish"), but nothing
-- ever enforced that at the database level. saveSettings()
-- (src/api/settings/settings.ts) decided INSERT vs UPDATE purely from
-- a client-supplied `id` — two concurrent first-ever saves (e.g. two
-- admin tabs, or a slow network causing a retry before `id` comes back
-- from the invalidated query) could both take the INSERT branch and
-- create two rows. Every reader (getSettings, getEmailBrand, the
-- Google Calendar address lookup) uses .maybeSingle(), which errors on
-- more than one matching row — a duplicate would make the homepage,
-- footer, about/location pages, every outgoing transactional email's
-- branding, and the Calendar event's location all silently fall back
-- to blank/default data.
--
-- Investigated first (see the accompanying report for the full
-- write-up): no foreign key anywhere references business_settings.id,
-- and no application code depends on any specific UUID value for this
-- row, so the row's identity can be freely consolidated without
-- touching any other table.
-- =============================================


-- ═══════════════════════════════════════════════
-- 1. Consolidate any existing duplicate rows.
--
-- Preservation rule (documented, not a silent merge): keep the row
-- with the most recent updated_at, tie-broken by the smallest id for
-- full determinism. This keeps one real, previously-saved row exactly
-- as an admin actually left it — it does not synthesize a hybrid row
-- by merging individual fields from multiple rows, since there is no
-- way to know which of several partial saves was "correct" field by
-- field, and the most recently completed save is the most defensible
-- single source of truth for "current settings". Safe to re-run: once
-- at most one row remains, this DELETE matches zero rows.
-- ═══════════════════════════════════════════════

DELETE FROM public.business_settings
WHERE id NOT IN (
  SELECT id FROM public.business_settings
  ORDER BY updated_at DESC, id ASC
  LIMIT 1
);


-- ═══════════════════════════════════════════════
-- 2. Add a fixed singleton discriminator and enforce it.
--
-- Standard Postgres singleton-table pattern: a boolean column that can
-- only ever be TRUE, with a UNIQUE constraint on it — since at most
-- one row can have the same UNIQUE value, at most one row can ever
-- exist. This is preferred over hardcoding a fixed row UUID anywhere
-- in application code (nothing currently does, and this keeps it that
-- way): the app never needs to know or guess the row's id, only that
-- singleton = true identifies it.
-- ═══════════════════════════════════════════════

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS singleton BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_settings_singleton_true'
  ) THEN
    ALTER TABLE public.business_settings
      ADD CONSTRAINT business_settings_singleton_true CHECK (singleton IS TRUE);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS business_settings_singleton_key
  ON public.business_settings (singleton);
