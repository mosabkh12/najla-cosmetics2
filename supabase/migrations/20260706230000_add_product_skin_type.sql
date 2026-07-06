-- Adds an optional skin_type filter to products: a single nullable value
-- per product (not multi-select) since a product recommended "for oily
-- skin" isn't also independently "for dry skin" in this catalog — keeps
-- the filter UI and query simple (one column, one equality check).
alter table public.products
  add column if not exists skin_type text;

alter table public.products
  add constraint products_skin_type_check
  check (skin_type is null or skin_type in ('oily', 'dry', 'sensitive', 'normal'));

comment on column public.products.skin_type is
  'Optional recommended skin type for filtering on the public products page: oily | dry | sensitive | normal | null (unspecified).';
