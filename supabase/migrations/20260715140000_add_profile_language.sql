-- =============================================
-- Customer language preference, for localized transactional emails
--
-- The site's active UI language lives only in the browser (localStorage,
-- src/lib/i18n.tsx) — server functions sending emails (booking
-- confirmations, status updates, back-in-stock notices, etc.) have no
-- way to know which language a given customer reads. This column is the
-- server-side record of that preference, kept in sync with the site's
-- language switcher (see updateProfileLanguage in
-- src/api/profiles/profiles.ts and the sync effect in Header.tsx)
-- whenever the customer is logged in.
-- =============================================

ALTER TABLE public.profiles ADD COLUMN language TEXT NOT NULL DEFAULT 'he';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_language_valid CHECK (language IN ('he', 'ar', 'en'));
