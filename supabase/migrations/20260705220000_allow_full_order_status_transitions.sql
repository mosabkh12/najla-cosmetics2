-- =============================================
-- Allow full order status transitions
--
-- 20260704190000_harden_order_appointment_status_transitions.sql made
-- "completed"/"cancelled" terminal for orders — no status could ever
-- move out of them again, enforced both in TypeScript
-- (ORDER_VALID_TRANSITIONS in updateOrderStatus) and here at the
-- database level as a hard backstop.
--
-- In practice this blocked a legitimate admin workflow: correcting a
-- mis-click (e.g. accidentally marking an order "completed" and needing
-- to set it back to "pending"). updateOrderStatus is reachable only
-- through requireAdmin + supabaseAdmin — direct client writes to
-- orders are, and remain, fully revoked from `authenticated`
-- (see 20260704160000_secure_order_creation.sql) — so the terminal-state
-- restriction was never protecting against a customer; it was only ever
-- getting in the admin's own way. Removing it here matches the
-- corresponding removal of the TypeScript-level allowlist in
-- updateOrderStatus (src/api/orders/orders.ts).
--
-- Scope: this migration touches ONLY the orders trigger/function.
-- check_appointment_status_transition (appointments) is untouched —
-- appointments remain governed by their own transition graph.
-- =============================================

DROP TRIGGER IF EXISTS check_order_status_transition ON public.orders;
DROP FUNCTION IF EXISTS public.check_order_status_transition();
