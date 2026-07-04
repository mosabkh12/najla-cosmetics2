-- =============================================
-- Harden Order & Appointment Status Transitions
--
-- Previous state:
--   - public.orders.status and public.appointments.status are already
--     genuine Postgres ENUMs (order_status / appointment_status), so
--     an out-of-enum value (e.g. 'bogus') was already rejected at the
--     type level — that part of "invalid status values" was already
--     covered.
--   - public.appointments had a PARTIAL transition guard
--     (check_appointment_status_transition) that only blocked leaving
--     a terminal state (completed/cancelled) — it did not encode the
--     full allowed transition graph (e.g. it would have allowed
--     pending -> pending or any other non-terminal-to-non-terminal
--     move without checking it made sense).
--   - public.orders had NO transition guard trigger at all — only
--     requireAdmin + RLS/grants stood between "any authenticated admin
--     session" and an arbitrary status change, with no protection
--     against e.g. cancelled -> completed if a future bug ever bypassed
--     the (until now nonexistent) TypeScript-side check.
--   - updateOrderStatus (src/api/orders/orders.ts) accepted a raw
--     `status: string` with no allowlist/transition validation, and
--     re-threw raw Supabase/Postgres errors on failure.
--
-- Fix: full, explicit transition-graph triggers for BOTH tables, kept
-- as a hard backstop beneath the TypeScript-level validation added to
-- updateOrderStatus/updateAppointmentStatus in the same change.
-- =============================================


-- ═══════════════════════════════════════════════
-- 1. ORDERS: full status-transition guard
--    pending -> confirmed, cancelled
--    confirmed -> preparing, cancelled
--    preparing -> completed, cancelled
--    completed / cancelled -> terminal (no further transitions)
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_order_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'pending'   AND NEW.status IN ('confirmed', 'cancelled')) OR
      (OLD.status = 'confirmed' AND NEW.status IN ('preparing', 'cancelled')) OR
      (OLD.status = 'preparing' AND NEW.status IN ('completed', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS check_order_status_transition ON public.orders;
CREATE TRIGGER check_order_status_transition
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.check_order_status_transition();

REVOKE ALL ON FUNCTION public.check_order_status_transition() FROM PUBLIC, anon, authenticated;


-- ═══════════════════════════════════════════════
-- 2. APPOINTMENTS: replace the partial (terminal-only) guard with the
--    full transition graph.
--    pending -> confirmed, completed, cancelled
--    confirmed -> completed, cancelled, pending
--    completed / cancelled -> terminal (no further transitions)
--
--    NOTE on confirmed -> pending: this edge is NOT reachable through
--    the admin-facing updateAppointmentStatus (its own TypeScript
--    transition map intentionally excludes it — an admin can never
--    manually revert a confirmed appointment to pending). It exists
--    here only because reschedule_appointment() (see
--    20260704180000_secure_appointment_booking.sql) legitimately resets
--    a rescheduled appointment's status to 'pending' regardless of
--    whether it was previously 'pending' or 'confirmed', so the moved
--    appointment goes back through admin confirmation. Excluding this
--    edge would break normal customer rescheduling of an already
--    confirmed appointment.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_appointment_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'pending'   AND NEW.status IN ('confirmed', 'completed', 'cancelled')) OR
      (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled', 'pending'))
    ) THEN
      RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Trigger itself is unchanged (already created in the previous
-- migration) — only the function body is being replaced here.
REVOKE ALL ON FUNCTION public.check_appointment_status_transition() FROM PUBLIC, anon, authenticated;
