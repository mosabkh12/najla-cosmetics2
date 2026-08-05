-- =============================================
-- Fix: create_order's idempotency key check trusted the key alone
--
-- create_order() (see 20260718100000_add_order_idempotency_key.sql)
-- short-circuits on an existing (user_id, idempotency_key) match and
-- returns that order's id — but it never checked whether the CURRENT
-- request's payload actually matches what was originally submitted
-- under that key. A reused key with a materially different cart or
-- delivery/customer details would silently return the OLD order,
-- masking the fact that the new request was never actually processed.
--
-- This was previously only a theoretical gap (the browser always pairs
-- one key with one fixed payload per checkout attempt), but Phase 8
-- makes the key survive page reloads via localStorage, which makes a
-- genuine key/payload mismatch reachable: the user's cart/details can
-- legitimately change between generating a key and a later reload that
-- still carries the same (now stale) key before the client-side
-- fingerprint check catches up.
--
-- Fix: create_order() now computes its own deterministic fingerprint
-- from the normalized request (never trusting a client-supplied
-- fingerprint) and stores it alongside idempotency_key. On an
-- existing-key hit, a matching fingerprint returns the existing order
-- as before; a mismatched fingerprint raises IDEMPOTENCY_PAYLOAD_MISMATCH
-- instead of silently returning the wrong order. Item quantities are
-- merged by product_id and sorted before hashing (mirrors the same
-- merge/sort the function already does for stock deduction) so
-- re-ordering the same cart never changes the fingerprint. Fields are
-- combined via a Postgres ROW(...)::text cast rather than delimited
-- string concatenation, which quotes/escapes each field automatically —
-- avoiding the classic "a|b" + "c" vs "a" + "b|c" collision risk of
-- manual delimiter-joined fingerprints.
-- =============================================

ALTER TABLE public.orders ADD COLUMN payload_fingerprint TEXT;

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
  v_items_fingerprint TEXT;
  v_payload_fingerprint TEXT;
  v_existing_order_id UUID;
  v_existing_fingerprint TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ORDER: missing user';
  END IF;

  v_customer_name := trim(COALESCE(p_customer_name, ''));
  v_customer_phone := trim(COALESCE(p_customer_phone, ''));
  v_notes := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_delivery_method := COALESCE(NULLIF(trim(p_delivery_method), ''), 'pickup');

  -- Canonical, order-independent representation of the requested items —
  -- built directly from the raw client input (merged by product_id,
  -- summed, sorted), not from validated/priced rows further below, so
  -- this reflects "what was asked for" rather than "what the server
  -- resolved it to." A malformed product_id/quantity here simply
  -- contributes nothing to the fingerprint (rather than erroring) —
  -- real shape validation still happens later, in the item-processing
  -- loop, for any request that isn't a recognized duplicate.
  SELECT string_agg(pid || ':' || qty::text, ',' ORDER BY pid)
  INTO v_items_fingerprint
  FROM (
    SELECT elem->>'product_id' AS pid, SUM(COALESCE((elem->>'quantity')::int, 0)) AS qty
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS elem
    WHERE elem->>'product_id' IS NOT NULL
    GROUP BY elem->>'product_id'
  ) merged;

  -- ROW(...)::text quotes/escapes each field automatically, so this
  -- can't collide the way naive delimiter-joined concatenation could
  -- (e.g. name="a|b", phone="c" vs name="a", phone="b|c").
  v_payload_fingerprint := md5((
    v_customer_name,
    v_customer_phone,
    COALESCE(v_notes, ''),
    v_delivery_method,
    COALESCE(p_delivery_area_id::text, ''),
    COALESCE(trim(p_delivery_street), ''),
    COALESCE(v_items_fingerprint, '')
  )::text);

  -- Checked first, before any further validation/locking below, so a
  -- duplicate submission (double-tap, reload-triggered retry) costs
  -- nothing beyond one indexed lookup and never re-touches stock. A
  -- fingerprint mismatch means this key is being reused for a
  -- materially different request — reject it rather than silently
  -- returning the old order or silently creating a second one.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, payload_fingerprint INTO v_existing_order_id, v_existing_fingerprint
    FROM public.orders
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_existing_fingerprint IS NOT DISTINCT FROM v_payload_fingerprint THEN
        RETURN QUERY SELECT v_existing_order_id, false;
        RETURN;
      END IF;
      RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH';
    END IF;
  END IF;

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
      payment_method, subtotal, total, status, idempotency_key, payload_fingerprint
    )
    VALUES (
      p_user_id, v_customer_name, v_customer_phone, v_notes, v_delivery_method,
      v_delivery_area_id, v_delivery_area_name, v_delivery_fee, v_delivery_street,
      'pay_at_store', 0, 0, 'pending', p_idempotency_key, v_payload_fingerprint
    )
    RETURNING id INTO v_order_id;
  EXCEPTION WHEN unique_violation THEN
    -- Lost a genuine concurrent race against another request carrying
    -- the exact same (user_id, idempotency_key) — the winner already
    -- created the order. Same fingerprint comparison as the early
    -- check above: return the winner's id only if this request's own
    -- payload actually matches what the winner stored.
    SELECT id, payload_fingerprint INTO v_existing_order_id, v_existing_fingerprint
    FROM public.orders
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_existing_fingerprint IS NOT DISTINCT FROM v_payload_fingerprint THEN
        RETURN QUERY SELECT v_existing_order_id, false;
        RETURN;
      END IF;
      RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH';
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

REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, UUID) TO service_role;
