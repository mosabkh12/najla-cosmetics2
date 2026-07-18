-- =============================================
-- Fix: grid pages transfer far more image data than they display
--
-- Every uploaded product/service photo is resized to a single ~2560px
-- variant (sized for a full-bleed hero/detail view on a high-DPI screen)
-- and that SAME file is reused for the small grid cards on the home page,
-- products list, services list, and related-products — each of which
-- displays it at a few hundred CSS pixels wide. A page with a dozen
-- product cards was downloading a dozen near-hero-sized images just to
-- shrink them in CSS, which is real, avoidable weight on exactly the
-- pages most visitors browse.
--
-- Fix: a second, small `thumbnail_url` generated client-side alongside
-- the full image at upload time (see image-resize.ts / upload-image.ts).
-- Grid cards (ProductCard/ServiceCard) use thumbnail_url when present,
-- falling back to image_url for older rows uploaded before this existed.
-- Full detail views keep using image_url — unchanged.
-- =============================================

ALTER TABLE public.products ADD COLUMN thumbnail_url TEXT;
ALTER TABLE public.services ADD COLUMN thumbnail_url TEXT;
