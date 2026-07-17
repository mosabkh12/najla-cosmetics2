-- =============================================
-- Services page gets its own hero banner image
--
-- The Services page hero (src/routes/services.tsx) was silently falling
-- back to reusing business_settings.hero_image_url — the exact same
-- field the admin Settings page labels "Hero Image (Home Page)" and
-- uploads for the home page hero. There was no way for the admin to set
-- a distinct banner for the Services page; changing the home hero
-- silently changed the Services hero too, with no indication anywhere
-- that the two were linked. Same pattern already fixed for the Products
-- page (products_hero_image_url) — this gives Services the same
-- treatment.
-- =============================================

ALTER TABLE public.business_settings ADD COLUMN services_hero_image_url TEXT;
