-- =============================================
-- Fix: cancelling an order never restored stock
--
-- create_order() deducts stock exactly once, at the moment an order is
-- created. Nothing anywhere ever credited it back — an admin cancelling
-- an order (or an order that simply rots in 'pending' forever) permanently
-- shrank the store's real sellable inventory with no way to recover it
-- short of manually editing stock_quantity by hand.
--
-- Fix: a dedicated update_order_status() RPC, mirroring create_order()'s
-- own locking discipline, that:
--   - restores stock for every item when an order moves INTO 'cancelled'
--     from anything else;
--   - re-deducts stock (after checking it's actually available again)
--     when an order moves OUT OF 'cancelled' back into any other status
--     — admin.orders.tsx allows every transition, including un-cancelling,
--     so this direction has to be handled too, not just cancel;
--   - does nothing to stock for every other transition (e.g.
--     pending -> confirmed -> preparing -> completed never touched stock
--     before and still doesn't — only cancelled <-> non-cancelled does).
--
-- Products deleted since the order was placed (order_items.product_id is
-- ON DELETE SET NULL) are skipped — there's no live row left to credit or
-- debit, and the order's line item still shows correctly via its
-- product_name/unit_price snapshot regardless.
-- =============================================

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_next_status TEXT
)
RETURNS TEXT -- the previous status, so the caller can decide whether to notify the customer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_item RECORD;
  v_product RECORD;
BEGIN
  IF p_next_status NOT IN ('pending', 'confirmed', 'preparing', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  -- Locks the order row for the duration of this transaction so two
  -- concurrent status updates on the same order can't interleave their
  -- stock adjustments.
  SELECT status INTO v_current_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_current_status = p_next_status THEN
    -- Re-saving the same status (e.g. a duplicate submit) — no stock
    -- change, but still refresh completed_at the same way a genuine
    -- re-entry into 'completed' always has.
    UPDATE public.orders
    SET completed_at = CASE WHEN p_next_status = 'completed' THEN now() ELSE completed_at END
    WHERE id = p_order_id;
    RETURN v_current_status;
  END IF;

  IF p_next_status = 'cancelled' THEN
    -- Moving INTO cancelled: credit stock back for every item, in
    -- ascending product_id order — same deterministic lock ordering
    -- create_order() uses, so this can never deadlock against a
    -- concurrent create_order/update_order_status touching the same
    -- products.
    FOR v_item IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = p_order_id AND product_id IS NOT NULL
      ORDER BY product_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item.quantity
      WHERE id = v_item.product_id;
    END LOOP;
  ELSIF v_current_status = 'cancelled' THEN
    -- Moving OUT OF cancelled: re-deduct stock, but only after
    -- confirming it's actually available again — an admin un-cancelling
    -- an old order must not be able to push stock negative just because
    -- other orders sold through it in the meantime.
    FOR v_item IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = p_order_id AND product_id IS NOT NULL
      ORDER BY product_id
    LOOP
      SELECT id, name, stock_quantity
      INTO v_product
      FROM public.products
      WHERE id = v_item.product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE: product no longer exists';
      END IF;

      IF v_product.stock_quantity < v_item.quantity THEN
        RAISE EXCEPTION 'OUT_OF_STOCK: insufficient stock to restore %', v_product.name;
      END IF;

      UPDATE public.products
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_product.id;
    END LOOP;
  END IF;
  -- Every other transition (pending/confirmed/preparing/completed, none
  -- of them 'cancelled' on either side) never touched stock before and
  -- still doesn't here.

  UPDATE public.orders
  SET status = p_next_status,
      completed_at = CASE WHEN p_next_status = 'completed' THEN now() ELSE NULL END
  WHERE id = p_order_id;

  RETURN v_current_status;
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, TEXT) TO service_role;
