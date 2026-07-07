-- The products page banner and the home page hero were sharing the same
-- hero_image_url column, so uploading a new photo for one silently became
-- the photo for the other too. This gives the products page its own,
-- independent image field.
alter table public.business_settings
  add column if not exists products_hero_image_url text;
