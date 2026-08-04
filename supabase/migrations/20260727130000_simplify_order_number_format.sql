-- =============================================
-- Fix: order numbers were needlessly hard to read
--
-- The old default ("NJ-" || today's date || "-" || 6 random hex chars,
-- e.g. "NJ-260727-92d304") mixes a date and a random fragment — nothing
-- about it is meant to be read or remembered by a customer, it just
-- looks like noise on the confirmation email.
--
-- Fix: a plain incrementing sequence, e.g. "NJ-1001", "NJ-1002" — short,
-- ordered, and easy to reference back on a call or in person. Only
-- affects NEW orders going forward; existing order_number values are
-- left untouched.
-- =============================================

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1001;

ALTER TABLE public.orders
  ALTER COLUMN order_number
  SET DEFAULT ('NJ-' || nextval('public.order_number_seq')::text);
