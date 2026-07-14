-- =============================================
-- Fix: deleting a product that has ever been ordered was silently blocked
--
-- order_items.product_id referenced products(id) with no ON DELETE
-- action, which Postgres defaults to NO ACTION (effectively RESTRICT).
-- Any product that had ever appeared in a single order could therefore
-- never actually be deleted — deleteProduct's DELETE would fail with a
-- foreign-key-violation error. The row stayed in the database (and kept
-- showing up on the public products page) even though the admin
-- attempted the delete.
--
-- Fix: ON DELETE SET NULL. order_items already snapshots product_name/
-- unit_price/total_price at order time — it never live-joins back to
-- products for display — so past orders keep showing correctly with
-- product_id simply becoming null. Same pattern already used for
-- orders.delivery_area_id.
-- =============================================

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_product_id_fkey,
  ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
