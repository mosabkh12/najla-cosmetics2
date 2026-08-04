-- =============================================
-- Fix: no protection against duplicate appointment submissions
--
-- Unlike create_order() (see 20260718100000_add_order_idempotency_key.sql),
-- create_appointment()/reschedule_appointment() had no idempotency key at
-- all. A double-tap on "Confirm Booking", a network retry, or two tabs
-- submitting the same in-flight request could reach the RPC twice. The
-- per-date advisory lock (pg_advisory_xact_lock(42, ...)) already
-- guarantees this can never double-book the slot — the second call's own
-- conflict check finds the first call's own just-inserted/just-updated
-- appointment as an "overlap" — but that means the user's own duplicate
-- submission comes back as a confusing TIME_TAKEN error instead of a
-- clean success, and (for reschedule) a genuinely concurrent duplicate
-- can still slip past the pre-lock ownership check and re-run the full
-- update a second time, re-sending confirmation emails and re-syncing
-- Google Calendar for no reason.
--
-- Fix: the client generates one random key per booking/reschedule
-- *attempt* (see BookingDialog.tsx/RescheduleDialog.tsx — regenerated
-- whenever the target service/date/time changes or the dialog is
-- reopened, so a genuinely different attempt is never blocked) and sends
-- it on every submit/retry of that same attempt.
--
--   * create_appointment: idempotency_key lives on the newly created row,
--     exactly like orders.idempotency_key. A UNIQUE (user_id,
--     idempotency_key) partial index makes this safe even under a true
--     concurrent race.
--   * reschedule_appointment: there is no new row — the key is stored on
--     the appointment being rescheduled (reschedule_idempotency_key,
--     overwritten on each successful reschedule) and compared against
--     that same row's current state.
--
-- Both checks run only after acquiring the existing per-date advisory
-- lock, not before it — a fast pre-lock check alone would miss a
-- genuinely concurrent duplicate (neither call would see the other's
-- row yet), so the check has to happen at the same serialization point
-- the existing conflict logic already relies on. Nothing about the
-- existing hours/breaks/closed-date/past-date/conflict/lock logic
-- changes for a request that isn't a recognized duplicate.
--
-- Either RPC only ever short-circuits when BOTH the key matches AND the
-- stored request is identical in every field that defines it (service,
-- date, time, and — for creation — customer name/phone/notes). A
-- reused key with a different payload is rejected with
-- IDEMPOTENCY_PAYLOAD_MISMATCH rather than silently applying the wrong
-- request or silently ignoring the difference.
-- =============================================


-- ═══════════════════════════════════════════════
-- 1. New columns + unique index
-- ═══════════════════════════════════════════════

ALTER TABLE public.appointments ADD COLUMN idempotency_key UUID;
ALTER TABLE public.appointments ADD COLUMN reschedule_idempotency_key UUID;

-- Partial (NULLs excluded) — never constrains older rows or any
-- future/administrative insert that omits a key. Creation-only: there is
-- no analogous uniqueness requirement for reschedule_idempotency_key,
-- since that column is compared against its own row, not looked up
-- across rows.
CREATE UNIQUE INDEX appointments_user_idempotency_key_idx
  ON public.appointments (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;


-- ═══════════════════════════════════════════════
-- 2. create_appointment — add p_idempotency_key, return (id, is_new)
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.create_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_user_id UUID,
  p_service_id UUID,
  p_appointment_date DATE,
  p_appointment_time TIME,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_notes TEXT,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS TABLE (appointment_id UUID, is_new BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment_id UUID;
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_notes TEXT;
  v_existing_by_key RECORD;
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

  -- Idempotency short-circuit — deliberately checked only AFTER
  -- acquiring the lock above, not before: a pre-lock check alone would
  -- miss a genuinely concurrent duplicate (the winner's row wouldn't be
  -- visible yet), and this call would fall through to the conflict
  -- check below, find the winner's own just-inserted appointment, and
  -- wrongly raise TIME_TAKEN against the user's own successful booking.
  -- Waiting for the lock guarantees that if a prior call with this key
  -- won the race, its row is already committed and visible here.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, service_id, appointment_date, appointment_time,
           customer_name, customer_phone, notes
    INTO v_existing_by_key
    FROM public.appointments
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_existing_by_key.service_id = p_service_id
         AND v_existing_by_key.appointment_date = p_appointment_date
         AND v_existing_by_key.appointment_time = p_appointment_time
         AND v_existing_by_key.customer_name = v_customer_name
         AND v_existing_by_key.customer_phone = v_customer_phone
         AND v_existing_by_key.notes IS NOT DISTINCT FROM v_notes
      THEN
        RETURN QUERY SELECT v_existing_by_key.id, false;
        RETURN;
      END IF;
      RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH';
    END IF;
  END IF;

  SELECT id, name, name_ar, duration_minutes, price, is_active
  INTO v_service
  FROM public.services
  WHERE id = p_service_id;

  IF NOT FOUND OR NOT v_service.is_active THEN
    RAISE EXCEPTION 'SERVICE_NOT_AVAILABLE';
  END IF;

  -- Distinct lock namespace (43) from the date lock above (42) — serializes
  -- concurrent booking attempts by this same user regardless of which
  -- date each one targets, closing the cross-date race on the count below.
  PERFORM pg_advisory_xact_lock(43, hashtext(p_user_id::text));

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
  IF p_appointment_date = v_today AND v_requested_start < v_now_minutes + 30 THEN
    RAISE EXCEPTION 'PAST_TIME';
  END IF;

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
    WHERE a.appointment_date = p_appointment_date
      AND a.status <> 'cancelled'
      AND v_requested_start < (
        (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int)
        + a.duration_minutes + v_buffer
      )
      AND (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int) < (v_requested_end + v_buffer)
  ) THEN
    RAISE EXCEPTION 'TIME_TAKEN';
  END IF;

  BEGIN
    INSERT INTO public.appointments (
      user_id, service_id, appointment_date, appointment_time,
      customer_name, customer_phone, notes, status, total_price,
      service_name, service_name_ar, duration_minutes, idempotency_key
    ) VALUES (
      p_user_id, p_service_id, p_appointment_date, p_appointment_time,
      v_customer_name, v_customer_phone, v_notes, 'confirmed', v_service.price,
      v_service.name, v_service.name_ar, v_service.duration_minutes, p_idempotency_key
    )
    RETURNING id INTO v_appointment_id;
  EXCEPTION WHEN unique_violation THEN
    -- Defense-in-depth: under the flow above this can only be reached if
    -- two calls carrying the same (user_id, idempotency_key) both somehow
    -- got past the post-lock check (e.g. a future code change bypassing
    -- it) — re-select and return the winner's row rather than erroring
    -- or creating a duplicate. Mirrors create_order()'s same pattern.
    SELECT id INTO v_appointment_id
    FROM public.appointments
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN QUERY SELECT v_appointment_id, false;
      RETURN;
    END IF;
    RAISE;
  END;

  RETURN QUERY SELECT v_appointment_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, UUID) TO service_role;


-- ═══════════════════════════════════════════════
-- 3. reschedule_appointment — add p_idempotency_key, return (id, applied)
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.reschedule_appointment(UUID, UUID, UUID, DATE, TIME);

CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_user_id UUID,
  p_appointment_id UUID,
  p_service_id UUID,
  p_appointment_date DATE,
  p_appointment_time TIME,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS TABLE (appointment_id UUID, applied BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_current RECORD;
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

  -- Idempotency short-circuit — re-reads the row's CURRENT state now
  -- that we hold the lock for the target date, so a genuinely
  -- concurrent identical reschedule (still in flight during the
  -- ownership check above, before either side had committed) is
  -- reliably seen here once it has committed and released this same
  -- lock, instead of this call racing past and re-applying the same
  -- update a second time (re-sending confirmation emails / re-syncing
  -- Google Calendar for no reason). There is no new row for
  -- reschedule — unlike create_appointment, the key is stored on (and
  -- compared against) the row being mutated, not looked up by key
  -- across rows.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT service_id, appointment_date, appointment_time, reschedule_idempotency_key
    INTO v_current
    FROM public.appointments
    WHERE id = p_appointment_id;

    IF v_current.reschedule_idempotency_key = p_idempotency_key THEN
      IF v_current.service_id = p_service_id
         AND v_current.appointment_date = p_appointment_date
         AND v_current.appointment_time = p_appointment_time
      THEN
        RETURN QUERY SELECT p_appointment_id, false;
        RETURN;
      END IF;
      RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH';
    END IF;
  END IF;

  SELECT id, name, name_ar, duration_minutes, price, is_active
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
  IF p_appointment_date = v_today AND v_requested_start < v_now_minutes + 30 THEN
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
    WHERE a.appointment_date = p_appointment_date
      AND a.status <> 'cancelled'
      AND a.id <> p_appointment_id
      AND v_requested_start < (
        (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int)
        + a.duration_minutes + v_buffer
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
      status = 'confirmed',
      service_name = v_service.name,
      service_name_ar = v_service.name_ar,
      duration_minutes = v_service.duration_minutes,
      reschedule_idempotency_key = p_idempotency_key
  WHERE id = p_appointment_id;

  RETURN QUERY SELECT p_appointment_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_appointment(UUID, UUID, UUID, DATE, TIME, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(UUID, UUID, UUID, DATE, TIME, UUID) TO service_role;
