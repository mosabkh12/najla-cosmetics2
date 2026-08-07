-- Diagnostic only — read-only SELECT, safe to run against production.
-- Run in Supabase Dashboard → SQL Editor (or any Postgres client/VS Code
-- extension connected to the project) to check whether the products/
-- services page hero images are actually set, or currently falling back
-- to the bundled 512x512 placeholder (public/images/brand/products-hero.png
-- and services-hero.png) — which is too small for the full-bleed hero
-- banner and looks soft/weak when the browser stretches it.
--
-- If either column below is NULL, that page is on the undersized
-- fallback. If it has a value, open Admin -> Settings -> Images and
-- check how it was set: uploading a file there resizes it correctly
-- (up to 2560px); pasting a URL directly does not resize anything, so a
-- low-resolution pasted URL will still look weak on the banner.
select
  products_hero_image_url,
  services_hero_image_url
from public.business_settings
where singleton = true;
