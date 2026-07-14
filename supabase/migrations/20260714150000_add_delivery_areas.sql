-- =============================================
-- Delivery Areas
--
-- Lets the admin define named delivery areas with a flat price each
-- (e.g. "Downtown — ₪20", "North side — ₪35"). Customers pick either
-- store pickup (free) or one of these areas at checkout; the fee is
-- resolved and locked server-side inside create_order(), never trusted
-- from the client, exactly like product prices already are.
--
-- Orders snapshot the area's name and price at order time
-- (delivery_area_name / delivery_fee), the same pattern order_items
-- already uses for product_name/unit_price — so a later price change or
-- even deletion of the area never rewrites the price/label on past
-- orders. delivery_area_id is kept too (ON DELETE SET NULL) purely as a
-- live reference for convenience; it is never the source of truth for
-- what a past order actually charged.
-- =============================================


-- ═══════════════════════════════════════════════
-- 1. delivery_areas table
--    Same access shape as availability_settings/services: public can
--    read active areas (plus admins can read all, for the admin UI),
--    all writes go exclusively through requireAdmin server functions
--    using supabaseAdmin (service_role bypasses RLS) — no INSERT/
--    UPDATE/DELETE grant to authenticated at all.
-- ═══════════════════════════════════════════════

CREATE TABLE public.delivery_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  name_en TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT delivery_areas_name_length CHECK (length(name) BETWEEN 1 AND 100),
  CONSTRAINT delivery_areas_price_non_negative CHECK (price >= 0)
);

GRANT SELECT ON public.delivery_areas TO anon, authenticated;
GRANT ALL ON public.delivery_areas TO service_role;

ALTER TABLE public.delivery_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_areas_public_read" ON public.delivery_areas
  FOR SELECT USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER delivery_areas_updated_at
  BEFORE UPDATE ON public.delivery_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═══════════════════════════════════════════════
-- 2. orders: widen delivery_method, add area reference + fee snapshot
-- ═══════════════════════════════════════════════

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_method_valid;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_method_valid CHECK (delivery_method IN ('pickup', 'delivery'));

ALTER TABLE public.orders
  ADD COLUMN delivery_area_id UUID REFERENCES public.delivery_areas(id) ON DELETE SET NULL,
  ADD COLUMN delivery_area_name TEXT,
  ADD COLUMN delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_fee_non_negative CHECK (delivery_fee >= 0),
  -- Defense-in-depth mirror of what create_order() below already
  -- enforces: pickup never carries an area/fee, delivery always
  -- resolves to a snapshotted area. Blocks this from drifting out of
  -- sync even if some future code path writes to orders directly.
  ADD CONSTRAINT orders_delivery_area_consistency CHECK (
    (delivery_method = 'pickup' AND delivery_area_id IS NULL AND delivery_fee = 0)
    OR (delivery_method = 'delivery' AND delivery_area_id IS NOT NULL)
  );


-- ═══════════════════════════════════════════════
-- 3. create_order RPC — extended with delivery-area pricing
--    Same function, new trailing p_delivery_area_id param. The old
--    6-arg overload is dropped outright (not left dangling) so
--    PostgREST never has two ambiguous create_order signatures to
--    resolve between.
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_order(
  p_user_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_notes TEXT,
  p_delivery_method TEXT,
  p_delivery_area_id UUID,
  p_items JSONB  -- [{"product_id": "...", "quantity": 2}, ...] — may contain duplicate product_ids
)
RETURNS UUID
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
  -- line item is validated and priced below. delivery_fee is already
  -- known at this point (resolved from delivery_areas above), so it's
  -- written immediately rather than left as a placeholder. If anything
  -- after this point raises, this INSERT is rolled back too — a single
  -- RPC call is one transaction.
  INSERT INTO public.orders (
    user_id, customer_name, customer_phone, notes, delivery_method,
    delivery_area_id, delivery_area_name, delivery_fee,
    payment_method, subtotal, total, status
  )
  VALUES (
    p_user_id, v_customer_name, v_customer_phone, v_notes, v_delivery_method,
    v_delivery_area_id, v_delivery_area_name, v_delivery_fee,
    'pay_at_store', 0, 0, 'pending'
  )
  RETURNING id INTO v_order_id;

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

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE: product not found';
    END IF;

    IF NOT v_product.is_active THEN
      RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE: product inactive';
    END IF;

    IF v_product.stock_quantity < v_quantity THEN
      RAISE EXCEPTION 'OUT_OF_STOCK: insufficient stock for %', v_product.name;
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

  RETURN v_order_id;
END;
$$;

-- Server-only: never callable directly by anon/authenticated. The app
-- only ever invokes this via supabaseAdmin (service_role) from the
-- createOrder server function, after requireSupabaseAuth has already
-- verified the caller's JWT.
REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) TO service_role;
