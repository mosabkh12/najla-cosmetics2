-- Products already carry a Hebrew name/description (base columns) plus an
-- optional Arabic translation (name_ar/description_ar). Adds the matching
-- optional English translation, so the storefront can show a real English
-- name/description instead of silently falling back to the Hebrew one when
-- a customer has the site set to English.
alter table public.products
  add column if not exists name_en text,
  add column if not exists description_en text;
