-- =============================================
-- Fix: no protection against duplicate order submissions
--
-- A double-tap on "Place Order", a network retry, or a client-side bug
-- re-invoking createOrder() would previously deduct stock and charge
-- the customer twice for the exact same cart, with no way to detect it
-- server-side — createOrder() had no notion of "this exact submission
-- already happened."
--
-- Fix: the client generates one random idempotency key per checkout
-- attempt and sends it with every createOrder() call for that attempt
-- (including retries). create_order() short-circuits and returns the
-- existing order's id the moment it sees a (user_id, idempotency_key)
-- pair it's already created an order for, instead of re-validating and
-- re-deducting stock. A unique index enforces this even under a true
-- concurrent race (two identical requests in flight at once) — the
-- loser of the race catches the resulting unique_violation and returns
-- the winner's order id rather than erroring.
--
-- The function additionally reports whether IT was the call that
-- created the order (is_new) vs. one that just found a prior one —
-- createOrder() uses this to send confirmation/admin emails exactly
-- once per order, never once per retry.
-- =============================================

ALTER TABLE public.orders ADD COLUMN idempotency_key UUID;

-- Partial (NULLs excluded) so this never constrains anything for older
-- rows or any future direct/administrative insert that omits a key.
CREATE UNIQUE INDEX orders_user_idempotency_key_idx
  ON public.orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ═══════════════════════════════════════════════
-- create_order RPC — extended with p_idempotency_key
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_order(
  p_user_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_notes TEXT,
  p_delivery_method TEXT,
  p_delivery_area_id UUID,
  p_delivery_street TEXT,
  p_items JSONB,  -- [{"product_id": "...", "quantity": 2}, ...] — may contain duplicate product_ids
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS TABLE (order_id UUID, is_new BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_subtotal NUMERIC(10,2) := 0;
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_notes TEXT;
  v_delivery_method TEXT;
  v_delivery_area_id UUID;
  v_delivery_area_name TEXT;
  v_delivery_fee NUMERIC(10,2) := 0;
  v_delivery_street TEXT;
  v_delivery_area RECORD;
  v_raw_item JSONB;
  v_raw_product_id UUID;
  v_raw_quantity INTEGER;
  v_product_id UUID;
  v_quantity INTEGER;
  v_product RECORD;
  v_line_total NUMERIC(10,2);
  v_unique_product_count INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ORDER: missing user';
  END IF;

  -- Checked first, before any validation/locking below, so a duplicate
  -- submission (double-tap, retry) costs nothing beyond one indexed
  -- lookup and never re-touches stock.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_order_id
    FROM public.orders
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN QUERY SELECT v_order_id, false;
      RETURN;
    END IF;
  END IF;

  v_customer_name := trim(COALESCE(p_customer_name, ''));
  v_customer_phone := trim(COALESCE(p_customer_phone, ''));
  v_notes := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_delivery_method := COALESCE(NULLIF(trim(p_delivery_method), ''), 'pickup');

  IF length(v_customer_name) = 0 THEN
    RAISE EXCEPTION 'INVALID_ORDER: customer name required';
  END IF;
  IF length(v_customer_name) > 100 THEN
    RAISE EXCEPTION 'INVALID_ORDER: customer name too long';
  END IF;

  IF length(v_customer_phone) = 0 THEN
    RAISE EXCEPTION 'INVALID_ORDER: customer phone required';
  END IF;
  IF length(v_customer_phone) > 30 THEN
    RAISE EXCEPTION 'INVALID_ORDER: customer phone too long';
  END IF;

  IF v_notes IS NOT NULL AND length(v_notes) > 1000 THEN
    RAISE EXCEPTION 'INVALID_ORDER: notes too long';
  END IF;

  IF v_delivery_method NOT IN ('pickup', 'delivery') THEN
    RAISE EXCEPTION 'INVALID_ORDER: unsupported delivery method';
  END IF;

  IF v_delivery_method = 'delivery' THEN
    IF p_delivery_area_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_ORDER: delivery area required';
    END IF;

    v_delivery_street := NULLIF(trim(COALESCE(p_delivery_street, '')), '');
    IF v_delivery_street IS NULL THEN
      RAISE EXCEPTION 'INVALID_ORDER: delivery street required';
    END IF;
    IF length(v_delivery_street) > 200 THEN
      RAISE EXCEPTION 'INVALID_ORDER: delivery street too long';
    END IF;

    -- Lock the area row so a concurrent admin deactivation or price
    -- change can't race between this lookup and the order being
    -- finalized — same reasoning as the per-product FOR UPDATE below.
    SELECT id, name, price, is_active
    INTO v_delivery_area
    FROM public.delivery_areas
    WHERE id = p_delivery_area_id
    FOR UPDATE;

    IF NOT FOUND OR NOT v_delivery_area.is_active THEN
      RAISE EXCEPTION 'DELIVERY_AREA_UNAVAILABLE: delivery area not available';
    END IF;

    v_delivery_area_id := v_delivery_area.id;
    v_delivery_area_name := v_delivery_area.name;
    v_delivery_fee := v_delivery_area.price;
  ELSE
    v_delivery_area_id := NULL;
    v_delivery_area_name := NULL;
    v_delivery_fee := 0;
    v_delivery_street := NULL;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_ORDER: no items';
  END IF;

  -- Validate every raw line item's shape up front, so a malformed
  -- entry fails with a clean message instead of a cast error surfacing
  -- from inside the aggregation query below.
  FOR v_raw_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_raw_product_id := (v_raw_item->>'product_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_ORDER: malformed product_id';
    END;
    IF v_raw_product_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_ORDER: missing product_id';
    END IF;

    BEGIN
      v_raw_quantity := (v_raw_item->>'quantity')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_ORDER: malformed quantity';
    END;
    IF v_raw_quantity IS NULL OR v_raw_quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_ORDER: invalid quantity';
    END IF;
  END LOOP;

  -- Cap on DISTINCT products, computed before merging duplicates so it
  -- reflects the real number of different products being ordered.
  SELECT count(*) INTO v_unique_product_count FROM (
    SELECT DISTINCT (elem->>'product_id')::UUID
    FROM jsonb_array_elements(p_items) AS elem
  ) AS distinct_products;

  IF v_unique_product_count > 50 THEN
    RAISE EXCEPTION 'INVALID_ORDER: too many distinct products';
  END IF;

  -- Order shell first; subtotal/total are placeholders until every
  -- line item is validated and priced below. delivery_fee/area/street
  -- are already known at this point, so they're written immediately
  -- rather than left as placeholders. If anything after this point
  -- raises, this INSERT is rolled back too — a single RPC call is one
  -- transaction.
  BEGIN
    INSERT INTO public.orders (
      user_id, customer_name, customer_phone, notes, delivery_method,
      delivery_area_id, delivery_area_name, delivery_fee, delivery_street,
      payment_method, subtotal, total, status, idempotency_key
    )
    VALUES (
      p_user_id, v_customer_name, v_customer_phone, v_notes, v_delivery_method,
      v_delivery_area_id, v_delivery_area_name, v_delivery_fee, v_delivery_street,
      'pay_at_store', 0, 0, 'pending', p_idempotency_key
    )
    RETURNING id INTO v_order_id;
  EXCEPTION WHEN unique_violation THEN
    -- Lost a genuine concurrent race against another request carrying
    -- the exact same (user_id, idempotency_key) — the winner already
    -- created the order, so return its id instead of erroring or
    -- creating a duplicate.
    SELECT id INTO v_order_id
    FROM public.orders
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN QUERY SELECT v_order_id, false;
      RETURN;
    END IF;
    RAISE;
  END;

  -- Merge duplicate product_id lines into one summed quantity per
  -- product (so the same product listed twice can't sneak past the
  -- per-product stock check twice), and iterate in a deterministic
  -- order — ascending product UUID — rather than raw client array
  -- order. Two concurrent orders that both touch products A and B will
  -- therefore always attempt to lock them in the same order, so one
  -- transaction simply waits for the other instead of the two
  -- deadlocking on each other's locks.
  FOR v_product_id, v_quantity IN
    SELECT (elem->>'product_id')::UUID AS pid, SUM((elem->>'quantity')::INTEGER) AS qty
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY (elem->>'product_id')::UUID
    ORDER BY (elem->>'product_id')::UUID
  LOOP
    -- Re-check the bound on the MERGED quantity — otherwise splitting
    -- one large order into many small duplicate lines for the same
    -- product would bypass a per-line-only cap.
    IF v_quantity <= 0 OR v_quantity > 100 THEN
      RAISE EXCEPTION 'INVALID_ORDER: invalid quantity';
    END IF;

    -- Lock the product row so a concurrent order for the same product
    -- must wait for this transaction to commit/rollback before it can
    -- read (and validate against) stock_quantity — this is what
    -- prevents two simultaneous orders from both succeeding when only
    -- one unit is left.
    SELECT id, name, price, stock_quantity, is_active
    INTO v_product
    FROM public.products
    WHERE id = v_product_id
    FOR UPDATE;

    -- "|"-delimited (code|product name) rather than a natural-language
    -- sentence — createOrder() passes this string through to the browser
    -- verbatim (it's entirely our own text, never raw Postgres error
    -- output), and checkout.tsx splits on "|" to show the customer
    -- exactly which product the problem is about instead of a generic
    -- "something in your cart" message. The name is left empty when
    -- there genuinely is none to show.
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE|';
    END IF;

    IF NOT v_product.is_active THEN
      RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE|%', v_product.name;
    END IF;

    IF v_product.stock_quantity < v_quantity THEN
      RAISE EXCEPTION 'OUT_OF_STOCK|%', v_product.name;
    END IF;

    v_line_total := v_product.price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;

    -- One order_items row per distinct product, with the merged quantity.
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES (v_order_id, v_product.id, v_product.name, v_quantity, v_product.price, v_line_total);

    UPDATE public.products
    SET stock_quantity = stock_quantity - v_quantity
    WHERE id = v_product.id;
  END LOOP;

  UPDATE public.orders
  SET subtotal = v_subtotal, total = v_subtotal + v_delivery_fee
  WHERE id = v_order_id;

  RETURN QUERY SELECT v_order_id, true;
END;
$$;

-- Server-only: never callable directly by anon/authenticated. The app
-- only ever invokes this via supabaseAdmin (service_role) from the
-- createOrder server function, after requireSupabaseAuth has already
-- verified the caller's JWT.
REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, UUID) TO service_role;
