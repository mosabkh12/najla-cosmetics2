-- =============================================
-- Secure Appointment Booking
--
-- Previous flow (src/api/appointments/appointments.ts):
--   - createAppointment/rescheduleAppointment already ran server-side
--     via supabaseAdmin and computed price/duration from
--     public.services, but the "read existing appointments for this
--     date, check for a conflict, then insert" sequence was not
--     atomic. Two concurrent bookings for overlapping times on the
--     same date could both pass their conflict check before either
--     INSERT landed, double-booking the salon (a single shared
--     resource across all services).
--   - public.appointments GRANTed INSERT/UPDATE directly to
--     `authenticated`, with RLS policies that checked row ownership
--     only — not which columns/values were written. A browser could
--     call PostgREST directly (bypassing the app entirely) to set
--     total_price, status, or any other column on its own appointment
--     to whatever it wanted.
--   - The past-date guard trigger compared against CURRENT_DATE
--     (server/DB timezone), not Asia/Jerusalem.
--
-- Fix: appointment creation/reschedule move into two SECURITY DEFINER
-- RPCs that load services/availability_settings authoritatively,
-- serialize concurrent bookings for the same date with a Postgres
-- advisory transaction lock (so the conflict-check-then-insert
-- sequence can never race), and are the only way appointments get
-- written going forward. Direct client INSERT/UPDATE is revoked.
-- =============================================


-- ═══════════════════════════════════════════════
-- 1. LOCK DOWN DIRECT CLIENT WRITES TO appointments
--    Reads for a user's own appointments (or admin) are unaffected.
-- ═══════════════════════════════════════════════

DROP POLICY IF EXISTS "appointments_own_insert" ON public.appointments;
DROP POLICY IF EXISTS "appointments_own_update" ON public.appointments;
REVOKE INSERT, UPDATE, DELETE ON public.appointments FROM authenticated;


-- ═══════════════════════════════════════════════
-- 2. TIMEZONE FIX for the past-date guard trigger
--    Was CURRENT_DATE (server/DB timezone) — now Asia/Jerusalem,
--    matching the RPCs below and the app's presentation logic.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_appointment_date()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.appointment_date < (now() AT TIME ZONE 'Asia/Jerusalem')::date THEN
    RAISE EXCEPTION 'Appointment date cannot be in the past';
  END IF;
  RETURN NEW;
END; $$;


-- ═══════════════════════════════════════════════
-- 3. create_appointment RPC
--    Server-only (service_role). Trusts only:
--      - p_user_id, passed by trusted server code that has already
--        verified the caller's JWT (requireSupabaseAuth)
--      - service_id / date / time / customer fields
--    Duration, price, weekly hours, breaks, closed dates, slot
--    interval, buffer, and max-per-day are all loaded from the
--    database inside this function — never from client input.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_user_id UUID,
  p_service_id UUID,
  p_appointment_date DATE,
  p_appointment_time TIME,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment_id UUID;
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_notes TEXT;
  v_service RECORD;
  v_weekly_hours JSONB;
  v_breaks JSONB;
  v_closed_dates JSONB;
  v_interval INTEGER;
  v_buffer INTEGER;
  v_max_per_day INTEGER;
  v_day JSONB;
  v_open INTEGER;
  v_close INTEGER;
  v_active_count INTEGER;
  v_today DATE;
  v_now_minutes INTEGER;
  v_requested_start INTEGER;
  v_requested_end INTEGER;
  v_conflict_count INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: missing user';
  END IF;
  IF p_appointment_date IS NULL OR p_appointment_time IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: date/time';
  END IF;

  v_customer_name := trim(COALESCE(p_customer_name, ''));
  v_customer_phone := trim(COALESCE(p_customer_phone, ''));
  v_notes := NULLIF(trim(COALESCE(p_notes, '')), '');

  IF length(v_customer_name) = 0 OR length(v_customer_name) > 100 THEN
    RAISE EXCEPTION 'INVALID_INPUT: name';
  END IF;
  IF length(v_customer_phone) = 0 OR length(v_customer_phone) > 30 THEN
    RAISE EXCEPTION 'INVALID_INPUT: phone';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 1000 THEN
    RAISE EXCEPTION 'INVALID_INPUT: notes';
  END IF;

  -- Serialize every booking attempt for this date. Any other call to
  -- create_appointment/reschedule_appointment targeting the same date
  -- blocks here until this transaction commits or rolls back, so the
  -- read-conflicts-then-insert sequence below can never race with a
  -- concurrent booking for the same date — this is what makes
  -- overlap/max-per-day enforcement safe under concurrency without an
  -- exclusion constraint or per-row locking.
  PERFORM pg_advisory_xact_lock(42, hashtext(p_appointment_date::text));

  SELECT id, name, duration_minutes, price, is_active
  INTO v_service
  FROM public.services
  WHERE id = p_service_id;

  IF NOT FOUND OR NOT v_service.is_active THEN
    RAISE EXCEPTION 'SERVICE_NOT_AVAILABLE';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM public.appointments
  WHERE user_id = p_user_id AND status IN ('pending', 'confirmed');
  IF v_active_count >= 2 THEN
    RAISE EXCEPTION 'MAX_APPOINTMENTS_REACHED';
  END IF;

  SELECT weekly_hours, breaks, slot_interval, buffer_minutes, max_per_day, closed_dates
  INTO v_weekly_hours, v_breaks, v_interval, v_buffer, v_max_per_day, v_closed_dates
  FROM public.availability_settings
  LIMIT 1;

  -- Defaults mirror DEFAULT_WEEKLY in src/api/slots/slots.ts, used
  -- when no settings row exists yet.
  v_weekly_hours := COALESCE(v_weekly_hours, '{
    "0": {"enabled": true, "open": "09:00", "close": "19:00"},
    "1": {"enabled": true, "open": "09:00", "close": "19:00"},
    "2": {"enabled": true, "open": "09:00", "close": "19:00"},
    "3": {"enabled": true, "open": "09:00", "close": "19:00"},
    "4": {"enabled": true, "open": "09:00", "close": "19:00"},
    "5": {"enabled": true, "open": "09:00", "close": "15:00"},
    "6": {"enabled": false, "open": "09:00", "close": "19:00"}
  }'::jsonb);
  v_breaks := COALESCE(v_breaks, '[]'::jsonb);
  v_closed_dates := COALESCE(v_closed_dates, '[]'::jsonb);
  v_interval := COALESCE(v_interval, 30);
  v_buffer := COALESCE(v_buffer, 0);

  -- Guard against a corrupted/nonsensical slot_interval before using it
  -- as a modulo divisor below (a zero value would raise a raw Postgres
  -- "division by zero" error instead of a clean, mapped error code).
  IF v_interval <= 0 OR v_interval > 480 THEN
    RAISE EXCEPTION 'INVALID_SLOT_TIME: bad interval';
  END IF;

  IF v_closed_dates ? p_appointment_date::text THEN
    RAISE EXCEPTION 'CLOSED_DAY';
  END IF;

  v_day := v_weekly_hours -> EXTRACT(DOW FROM p_appointment_date)::TEXT;
  IF v_day IS NULL OR COALESCE((v_day->>'enabled')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CLOSED_DAY';
  END IF;

  v_open := (split_part(v_day->>'open', ':', 1)::int * 60) + split_part(v_day->>'open', ':', 2)::int;
  v_close := (split_part(v_day->>'close', ':', 1)::int * 60) + split_part(v_day->>'close', ':', 2)::int;

  v_requested_start := (EXTRACT(HOUR FROM p_appointment_time)::int * 60) + EXTRACT(MINUTE FROM p_appointment_time)::int;
  v_requested_end := v_requested_start + v_service.duration_minutes;

  IF v_requested_start < v_open OR v_requested_end > v_close THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS';
  END IF;

  -- Slot alignment is relative to that day's opening time, not
  -- midnight (opening time may not always be 00:00) — matches how
  -- getAvailableTimes() generates candidate slots in
  -- src/api/appointments/appointments.ts.
  IF MOD(v_requested_start - v_open, v_interval) <> 0 THEN
    RAISE EXCEPTION 'INVALID_SLOT_TIME';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_breaks) b
    WHERE v_requested_start < ((split_part(b->>'end', ':', 1)::int * 60) + split_part(b->>'end', ':', 2)::int)
      AND v_requested_end > ((split_part(b->>'start', ':', 1)::int * 60) + split_part(b->>'start', ':', 2)::int)
  ) THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  v_now_minutes := (EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Jerusalem'))::int * 60)
                 + EXTRACT(MINUTE FROM (now() AT TIME ZONE 'Asia/Jerusalem'))::int;

  IF p_appointment_date < v_today THEN
    RAISE EXCEPTION 'PAST_DATE';
  END IF;
  IF p_appointment_date = v_today AND v_requested_start < v_now_minutes THEN
    RAISE EXCEPTION 'PAST_TIME';
  END IF;

  -- Cross-service overlap check: the salon is a single shared
  -- resource, so appointments for ANY service on this date count
  -- toward max_per_day and must not overlap (+ buffer) the requested
  -- slot, based on each existing appointment's own service duration.
  SELECT count(*) INTO v_conflict_count
  FROM public.appointments a
  WHERE a.appointment_date = p_appointment_date
    AND a.status <> 'cancelled';

  IF v_max_per_day IS NOT NULL AND v_conflict_count >= v_max_per_day THEN
    RAISE EXCEPTION 'TIME_TAKEN';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    WHERE a.appointment_date = p_appointment_date
      AND a.status <> 'cancelled'
      AND v_requested_start < (
        (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int)
        + s.duration_minutes + v_buffer
      )
      AND (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int) < (v_requested_end + v_buffer)
  ) THEN
    RAISE EXCEPTION 'TIME_TAKEN';
  END IF;

  INSERT INTO public.appointments (
    user_id, service_id, appointment_date, appointment_time,
    customer_name, customer_phone, notes, status, total_price
  ) VALUES (
    p_user_id, p_service_id, p_appointment_date, p_appointment_time,
    v_customer_name, v_customer_phone, v_notes, 'pending', v_service.price
  )
  RETURNING id INTO v_appointment_id;

  RETURN v_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT) TO service_role;


-- ═══════════════════════════════════════════════
-- 4. reschedule_appointment RPC
--    Same authoritative validation as create_appointment, applied to
--    an existing appointment: ownership + status are checked first,
--    the appointment being moved is excluded from its own conflict
--    check, and price/duration are recalculated from the (possibly
--    new) service — never trusted from the client.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_user_id UUID,
  p_appointment_id UUID,
  p_service_id UUID,
  p_appointment_date DATE,
  p_appointment_time TIME
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_service RECORD;
  v_weekly_hours JSONB;
  v_breaks JSONB;
  v_closed_dates JSONB;
  v_interval INTEGER;
  v_buffer INTEGER;
  v_max_per_day INTEGER;
  v_day JSONB;
  v_open INTEGER;
  v_close INTEGER;
  v_today DATE;
  v_now_minutes INTEGER;
  v_requested_start INTEGER;
  v_requested_end INTEGER;
  v_conflict_count INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: missing user';
  END IF;
  IF p_appointment_date IS NULL OR p_appointment_time IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: date/time';
  END IF;

  SELECT id, user_id, status
  INTO v_existing
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND OR v_existing.user_id <> p_user_id THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_existing.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'NOT_RESCHEDULABLE';
  END IF;

  -- Same per-date serialization as create_appointment, keyed on the
  -- NEW target date (the only date whose availability this operation
  -- can affect the safety of).
  PERFORM pg_advisory_xact_lock(42, hashtext(p_appointment_date::text));

  SELECT id, name, duration_minutes, price, is_active
  INTO v_service
  FROM public.services
  WHERE id = p_service_id;

  IF NOT FOUND OR NOT v_service.is_active THEN
    RAISE EXCEPTION 'SERVICE_NOT_AVAILABLE';
  END IF;

  SELECT weekly_hours, breaks, slot_interval, buffer_minutes, max_per_day, closed_dates
  INTO v_weekly_hours, v_breaks, v_interval, v_buffer, v_max_per_day, v_closed_dates
  FROM public.availability_settings
  LIMIT 1;

  v_weekly_hours := COALESCE(v_weekly_hours, '{
    "0": {"enabled": true, "open": "09:00", "close": "19:00"},
    "1": {"enabled": true, "open": "09:00", "close": "19:00"},
    "2": {"enabled": true, "open": "09:00", "close": "19:00"},
    "3": {"enabled": true, "open": "09:00", "close": "19:00"},
    "4": {"enabled": true, "open": "09:00", "close": "19:00"},
    "5": {"enabled": true, "open": "09:00", "close": "15:00"},
    "6": {"enabled": false, "open": "09:00", "close": "19:00"}
  }'::jsonb);
  v_breaks := COALESCE(v_breaks, '[]'::jsonb);
  v_closed_dates := COALESCE(v_closed_dates, '[]'::jsonb);
  v_interval := COALESCE(v_interval, 30);
  v_buffer := COALESCE(v_buffer, 0);

  -- Guard against a corrupted/nonsensical slot_interval before using it
  -- as a modulo divisor below (a zero value would raise a raw Postgres
  -- "division by zero" error instead of a clean, mapped error code).
  IF v_interval <= 0 OR v_interval > 480 THEN
    RAISE EXCEPTION 'INVALID_SLOT_TIME: bad interval';
  END IF;

  IF v_closed_dates ? p_appointment_date::text THEN
    RAISE EXCEPTION 'CLOSED_DAY';
  END IF;

  v_day := v_weekly_hours -> EXTRACT(DOW FROM p_appointment_date)::TEXT;
  IF v_day IS NULL OR COALESCE((v_day->>'enabled')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CLOSED_DAY';
  END IF;

  v_open := (split_part(v_day->>'open', ':', 1)::int * 60) + split_part(v_day->>'open', ':', 2)::int;
  v_close := (split_part(v_day->>'close', ':', 1)::int * 60) + split_part(v_day->>'close', ':', 2)::int;

  v_requested_start := (EXTRACT(HOUR FROM p_appointment_time)::int * 60) + EXTRACT(MINUTE FROM p_appointment_time)::int;
  v_requested_end := v_requested_start + v_service.duration_minutes;

  IF v_requested_start < v_open OR v_requested_end > v_close THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS';
  END IF;

  -- Slot alignment is relative to that day's opening time, not
  -- midnight (opening time may not always be 00:00) — matches how
  -- getAvailableTimes() generates candidate slots in
  -- src/api/appointments/appointments.ts.
  IF MOD(v_requested_start - v_open, v_interval) <> 0 THEN
    RAISE EXCEPTION 'INVALID_SLOT_TIME';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_breaks) b
    WHERE v_requested_start < ((split_part(b->>'end', ':', 1)::int * 60) + split_part(b->>'end', ':', 2)::int)
      AND v_requested_end > ((split_part(b->>'start', ':', 1)::int * 60) + split_part(b->>'start', ':', 2)::int)
  ) THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  v_now_minutes := (EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Jerusalem'))::int * 60)
                 + EXTRACT(MINUTE FROM (now() AT TIME ZONE 'Asia/Jerusalem'))::int;

  IF p_appointment_date < v_today THEN
    RAISE EXCEPTION 'PAST_DATE';
  END IF;
  IF p_appointment_date = v_today AND v_requested_start < v_now_minutes THEN
    RAISE EXCEPTION 'PAST_TIME';
  END IF;

  SELECT count(*) INTO v_conflict_count
  FROM public.appointments a
  WHERE a.appointment_date = p_appointment_date
    AND a.status <> 'cancelled'
    AND a.id <> p_appointment_id;

  IF v_max_per_day IS NOT NULL AND v_conflict_count >= v_max_per_day THEN
    RAISE EXCEPTION 'TIME_TAKEN';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    WHERE a.appointment_date = p_appointment_date
      AND a.status <> 'cancelled'
      AND a.id <> p_appointment_id
      AND v_requested_start < (
        (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int)
        + s.duration_minutes + v_buffer
      )
      AND (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int) < (v_requested_end + v_buffer)
  ) THEN
    RAISE EXCEPTION 'TIME_TAKEN';
  END IF;

  UPDATE public.appointments
  SET service_id = p_service_id,
      appointment_date = p_appointment_date,
      appointment_time = p_appointment_time,
      total_price = v_service.price,
      status = 'pending'
  WHERE id = p_appointment_id;

  RETURN p_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_appointment(UUID, UUID, UUID, DATE, TIME) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(UUID, UUID, UUID, DATE, TIME) TO service_role;


-- ═══════════════════════════════════════════════
-- 5. Admin status-transition guard (database backstop)
--    completed/cancelled are terminal — nothing may transition out of
--    them, regardless of which trusted server code performs the
--    UPDATE. The full transition allowlist (e.g. pending -> confirmed
--    -> completed) is enforced in the requireAdmin-gated TS handler;
--    this trigger is the unconditional, cheap invariant beneath it.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_appointment_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid appointment status transition: % is terminal', OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS check_appointment_status_transition ON public.appointments;
CREATE TRIGGER check_appointment_status_transition
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.check_appointment_status_transition();

REVOKE ALL ON FUNCTION public.check_appointment_status_transition() FROM PUBLIC, anon, authenticated;
