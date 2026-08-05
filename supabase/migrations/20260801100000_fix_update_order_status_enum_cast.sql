-- =============================================
-- Fix: update_order_status() raised a real Postgres error on every
-- genuine status transition
--
-- p_next_status is declared TEXT, and public.orders.status is the
-- order_status ENUM. Postgres does not implicitly or automatically
-- assignment-cast a TEXT variable to a user-defined enum type, so the
-- function's final `UPDATE public.orders SET status = p_next_status ...`
-- failed with "column "status" is of type order_status but expression
-- is of type text" (SQLSTATE 42804) for every call that reached it.
--
-- This was never caught because:
--   - every previous test of updateOrderStatus() (the TS handler) used
--     a mocked Supabase client, which never actually executes real
--     Postgres type checking;
--   - the one call path that DID skip the broken UPDATE — re-saving the
--     exact same status, handled by a separate early-return branch that
--     never touches the `status` column at all — happened to be the
--     only path any existing test exercised.
-- Confirmed directly against a real local Postgres instance while
-- investigating the `supabase db lint` finding (see the Phase 9 report):
-- every other transition (e.g. pending -> confirmed, any -> cancelled,
-- cancelled -> any) genuinely failed.
--
-- Fix: cast the validated p_next_status into a properly-typed
-- order_status local variable immediately after the existing allow-list
-- validation (which already guarantees it's one of the enum's members),
-- and use that variable everywhere `status` is written — the same
-- pattern admin_update_appointment_status() already uses for
-- appointment_status (v_new_status := p_status::public.appointment_status),
-- now applied consistently here too. No behavior changes beyond making
-- the write actually succeed: validation, locking, stock
-- restoration/deduction, and the "same status" idempotent no-op branch
-- are all unchanged.
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
  v_next_status public.order_status;
  v_item RECORD;
  v_product RECORD;
BEGIN
  IF p_next_status NOT IN ('pending', 'confirmed', 'preparing', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;
  v_next_status := p_next_status::public.order_status;

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
    SET completed_at = CASE WHEN v_next_status = 'completed' THEN now() ELSE completed_at END
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
  SET status = v_next_status,
      completed_at = CASE WHEN v_next_status = 'completed' THEN now() ELSE NULL END
  WHERE id = p_order_id;

  RETURN v_current_status;
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, TEXT) TO service_role;
