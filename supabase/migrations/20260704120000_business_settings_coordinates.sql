-- =============================================
-- Business Location Coordinates
-- Adds precise lat/lng so the map, Google Maps
-- directions, and Waze all point at the exact
-- location instead of a fuzzy text search.
-- =============================================

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_latitude_range CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  ADD CONSTRAINT business_settings_longitude_range CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180));
