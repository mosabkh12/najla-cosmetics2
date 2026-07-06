-- Same rationale as 20260707120000_add_product_english_fields.sql, for
-- services: an optional English translation alongside the existing
-- Hebrew (base) and Arabic (name_ar/description_ar) columns.
alter table public.services
  add column if not exists name_en text,
  add column if not exists description_en text;
