-- =============================================
-- Secure Order Creation
--
-- Previous flow (src/api/orders/orders.ts createOrder):
--   - Inserted into orders/order_items using the user's own RLS-scoped
--     client, trusting client-supplied unit_price/total_price/subtotal/
--     product_name outright — a client could set unit_price to 0.01 and
--     the order would be created at that price.
--   - orders_own_insert / order_items_own_insert had no column
--     restrictions, so this was exploitable even bypassing the app's
--     own UI entirely (direct PostgREST calls from a browser console).
--   - orders and order_items were inserted as two separate statements
--     with no transaction — a failure between them left an order with
--     no items.
--   - deduct_stock_on_order_item (from security_hardening.sql) deducted
--     stock via GREATEST(0, stock_quantity - NEW.quantity), which never
--     rejects an order that exceeds available stock — it just silently
--     clamps to zero, allowing overselling.
--
-- Fix: a single SECURITY DEFINER RPC (create_order) does everything
-- atomically — merges duplicate product_id lines, locks each distinct
-- product row (in a deterministic order, to avoid deadlocking against
-- concurrent multi-product orders) with SELECT ... FOR UPDATE, validates
-- every item against the database (not the client), computes every
-- price server-side from products.price, and only then writes the
-- order, its items, and the stock deduction, all in one transaction
-- that rolls back completely on any failure. Direct client INSERT/
-- UPDATE/DELETE on orders/order_items is removed — the RPC is the only
-- write path.
-- =============================================


-- ═══════════════════════════════════════════════
-- 1. REMOVE THE OLD UNSAFE STOCK-DEDUCTION TRIGGER
--    create_order() now owns stock deduction end-to-end.
--    Keeping both would deduct stock twice per order.
-- ═══════════════════════════════════════════════

DROP TRIGGER IF EXISTS deduct_stock_on_order_item ON public.order_items;
DROP FUNCTION IF EXISTS public.deduct_stock_on_order_item();


-- ═══════════════════════════════════════════════
-- 2. DATABASE-LEVEL LIMITS ON orders
--    Defense-in-depth: enforced here even if some future code path
--    ever bypasses create_order()'s own validation.
-- ═══════════════════════════════════════════════

ALTER TABLE public.orders
  ADD CONSTRAINT orders_customer_name_length CHECK (length(customer_name) <= 100),
  ADD CONSTRAINT orders_customer_phone_length CHECK (length(customer_phone) <= 30),
  ADD CONSTRAINT orders_notes_length CHECK (notes IS NULL OR length(notes) <= 1000),
  -- Only delivery methods the app actually offers today (checkout.tsx
  -- only ever sends 'pickup'). Extend this list in a future migration
  -- if/when more delivery options are added.
  ADD CONSTRAINT orders_delivery_method_valid CHECK (delivery_method IN ('pickup'));


-- ═══════════════════════════════════════════════
-- 3. create_order RPC
--    Server-only (service_role). Trusts only:
--      - p_user_id, passed by trusted server code that has already
--        verified the caller's JWT (requireSupabaseAuth)
--      - product_id + quantity per line item
--    Every price, the subtotal/total, product_name, and stock
--    deduction are computed from public.products inside this
--    function — never from client input.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_order(
  p_user_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_notes TEXT,
  p_delivery_method TEXT,
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

  IF v_delivery_method NOT IN ('pickup') THEN
    RAISE EXCEPTION 'INVALID_ORDER: unsupported delivery method';
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
  -- line item is validated and priced below. If anything after this
  -- point raises, this INSERT is rolled back too — a single RPC call
  -- is one transaction.
  INSERT INTO public.orders (
    user_id, customer_name, customer_phone, notes, delivery_method,
    payment_method, subtotal, total, status
  )
  VALUES (
    p_user_id, v_customer_name, v_customer_phone, v_notes, v_delivery_method,
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

  UPDATE public.orders SET subtotal = v_subtotal, total = v_subtotal WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

-- Server-only: never callable directly by anon/authenticated. The app
-- only ever invokes this via supabaseAdmin (service_role) from the
-- createOrder server function, after requireSupabaseAuth has already
-- verified the caller's JWT.
REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;


-- ═══════════════════════════════════════════════
-- 4. LOCK DOWN DIRECT CLIENT WRITES TO orders / order_items
--    All writes now go exclusively through create_order() (inserts)
--    and updateOrderStatus (admin, via supabaseAdmin). Reads for a
--    user's own orders are unaffected.
-- ═══════════════════════════════════════════════

-- orders: drop every policy that permitted direct authenticated writes.
-- orders_own_cancel/orders_admin_update were already effectively
-- unreachable from the app (updateOrderStatus uses supabaseAdmin, and
-- no UI path calls a client-side order cancel) — removed for clarity
-- so no stale, misleading policy is left granting write access.
DROP POLICY IF EXISTS "orders_own_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
DROP POLICY IF EXISTS "orders_own_cancel" ON public.orders;
-- DELETE was never GRANTed on orders and no DELETE policy has ever
-- existed for it — revoked anyway as an explicit, defensive statement
-- rather than relying on it having simply never been granted.
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;

-- order_items: same treatment. UPDATE/DELETE were likewise never
-- granted or policied for this table — revoked explicitly regardless.
DROP POLICY IF EXISTS "order_items_own_insert" ON public.order_items;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated;


-- Read access for a user's own orders/items (orders_own_select,
-- order_items_own_select — both already scoped to auth.uid() = user_id
-- OR admin) is untouched by this migration and continues to work
-- exactly as before for getUserOrders / the profile "Orders" tab.
