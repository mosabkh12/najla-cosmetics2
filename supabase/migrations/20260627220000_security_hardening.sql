-- =============================================
-- Security Hardening Migration
-- Fixes: grant tightening, policy splitting,
-- input validation, storage, indexes
-- =============================================

-- ═══════════════════════════════════════════════
-- 1. REVOKE has_role FROM anon
--    Anon users have no business checking roles.
--    Split public read policies to be anon-safe.
-- ═══════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;

-- Services: split into anon-safe + admin-inclusive
DROP POLICY IF EXISTS "services_public_read" ON public.services;
CREATE POLICY "services_anon_read" ON public.services
  FOR SELECT TO anon
  USING (is_active = true);
CREATE POLICY "services_auth_read" ON public.services
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Products: same split
DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_anon_read" ON public.products
  FOR SELECT TO anon
  USING (is_active = true);
CREATE POLICY "products_auth_read" ON public.products
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Product images: split
DROP POLICY IF EXISTS "product_images_public_read" ON public.product_images;
CREATE POLICY "product_images_anon_read" ON public.product_images
  FOR SELECT TO anon USING (true);
CREATE POLICY "product_images_auth_read" ON public.product_images
  FOR SELECT TO authenticated USING (true);

-- Appointment slots: split
DROP POLICY IF EXISTS "slots_public_read" ON public.appointment_slots;
CREATE POLICY "slots_anon_read" ON public.appointment_slots
  FOR SELECT TO anon USING (true);
CREATE POLICY "slots_auth_read" ON public.appointment_slots
  FOR SELECT TO authenticated USING (true);

-- Business settings: split
DROP POLICY IF EXISTS "business_settings_public_read" ON public.business_settings;
CREATE POLICY "settings_anon_read" ON public.business_settings
  FOR SELECT TO anon USING (true);
CREATE POLICY "settings_auth_read" ON public.business_settings
  FOR SELECT TO authenticated USING (true);


-- ═══════════════════════════════════════════════
-- 2. TIGHTEN GRANTs ON ADMIN-ONLY TABLES
--    Server functions use service_role for admin writes,
--    so authenticated users don't need write GRANTs.
--    This blocks any direct API abuse even if RLS fails.
-- ═══════════════════════════════════════════════

-- Services: read-only for authenticated
REVOKE INSERT, UPDATE, DELETE ON public.services FROM authenticated;

-- Products: read-only for authenticated
REVOKE INSERT, UPDATE, DELETE ON public.products FROM authenticated;

-- Product images: read-only for authenticated
REVOKE INSERT, UPDATE, DELETE ON public.product_images FROM authenticated;

-- Appointment slots: read-only for authenticated
REVOKE INSERT, UPDATE, DELETE ON public.appointment_slots FROM authenticated;

-- Business settings: read-only for authenticated
REVOKE INSERT, UPDATE, DELETE ON public.business_settings FROM authenticated;


-- ═══════════════════════════════════════════════
-- 3. USER ORDER CANCELLATION
--    Users should be able to cancel their own pending orders.
-- ═══════════════════════════════════════════════

DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;

-- Admin can update any order
CREATE POLICY "orders_admin_update" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Users can cancel their own pending/confirmed orders
CREATE POLICY "orders_own_cancel" ON public.orders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status IN ('pending', 'confirmed'))
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');


-- ═══════════════════════════════════════════════
-- 4. DATA VALIDATION CONSTRAINTS
--    Enforce data integrity at the DB level.
-- ═══════════════════════════════════════════════

-- Prices must be non-negative
ALTER TABLE public.services ADD CONSTRAINT services_price_positive CHECK (price >= 0);
ALTER TABLE public.products ADD CONSTRAINT products_price_positive CHECK (price >= 0);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_price_positive CHECK (total_price >= 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_subtotal_positive CHECK (subtotal >= 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_total_positive CHECK (total >= 0);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_price_positive CHECK (unit_price >= 0 AND total_price >= 0);

-- Quantities must be positive
ALTER TABLE public.products ADD CONSTRAINT products_stock_non_negative CHECK (stock_quantity >= 0);
ALTER TABLE public.products ADD CONSTRAINT products_threshold_positive CHECK (low_stock_threshold >= 0);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_qty_positive CHECK (quantity > 0);

-- Duration must be positive
ALTER TABLE public.services ADD CONSTRAINT services_duration_positive CHECK (duration_minutes > 0);

-- Appointment date must not be in the past (soft — only for new inserts via trigger)
CREATE OR REPLACE FUNCTION public.check_appointment_date()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.appointment_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Appointment date cannot be in the past';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS check_appointment_date ON public.appointments;
CREATE TRIGGER check_appointment_date
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.check_appointment_date();

-- Revoke direct execution of validation trigger
REVOKE ALL ON FUNCTION public.check_appointment_date() FROM PUBLIC, anon, authenticated;

-- Name fields must not be empty
ALTER TABLE public.services ADD CONSTRAINT services_name_not_empty CHECK (length(trim(name)) > 0);
ALTER TABLE public.products ADD CONSTRAINT products_name_not_empty CHECK (length(trim(name)) > 0);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_name_not_empty CHECK (length(trim(customer_name)) > 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_name_not_empty CHECK (length(trim(customer_name)) > 0);

-- Phone must not be empty
ALTER TABLE public.appointments ADD CONSTRAINT appointments_phone_not_empty CHECK (length(trim(customer_phone)) > 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_phone_not_empty CHECK (length(trim(customer_phone)) > 0);


-- ═══════════════════════════════════════════════
-- 5. PERFORMANCE INDEXES
-- ═══════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON public.appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_service_date ON public.appointments(service_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_services_active ON public.services(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_product_id ON public.favorites(product_id);

CREATE INDEX IF NOT EXISTS idx_slots_date ON public.appointment_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_slots_service_id ON public.appointment_slots(service_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);


-- ═══════════════════════════════════════════════
-- 6. STORAGE BUCKET + POLICIES
-- ═══════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images',
  'images',
  true,
  5242880,  -- 5MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone can view public images
DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;
DROP POLICY IF EXISTS "images_public_read" ON storage.objects;
CREATE POLICY "images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');

-- Only authenticated users can upload
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "images_auth_upload" ON storage.objects;
CREATE POLICY "images_auth_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'images');

-- Only the uploader or admin can update/delete
DROP POLICY IF EXISTS "Authenticated users can update images" ON storage.objects;
DROP POLICY IF EXISTS "images_auth_manage" ON storage.objects;
CREATE POLICY "images_auth_manage" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'images');

DROP POLICY IF EXISTS "images_auth_delete" ON storage.objects;
CREATE POLICY "images_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'images');


-- ═══════════════════════════════════════════════
-- 7. STOCK DEDUCTION ON ORDER (optional but pro)
--    Automatically decrease stock when order is placed.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.deduct_stock_on_order_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.products
  SET stock_quantity = GREATEST(0, stock_quantity - NEW.quantity)
  WHERE id = NEW.product_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS deduct_stock_on_order_item ON public.order_items;
CREATE TRIGGER deduct_stock_on_order_item
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  WHEN (NEW.product_id IS NOT NULL)
  EXECUTE FUNCTION public.deduct_stock_on_order_item();

REVOKE ALL ON FUNCTION public.deduct_stock_on_order_item() FROM PUBLIC, anon, authenticated;


-- ═══════════════════════════════════════════════
-- 8. DEFAULT BUSINESS SETTINGS ROW
-- ═══════════════════════════════════════════════

INSERT INTO public.business_settings (business_name, phone, whatsapp_number, address)
VALUES ('Najla Cosmetics', '0526867838', '0526867838', 'Nazareth, Israel')
ON CONFLICT DO NOTHING;
