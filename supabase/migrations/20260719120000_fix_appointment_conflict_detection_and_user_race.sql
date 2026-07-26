-- =============================================
-- Fix 1: deleting a booked service silently disabled double-booking
-- protection for its still-active appointments.
--
-- create_appointment/reschedule_appointment's overlap check, and
-- getAvailableTimes' equivalent read in src/api/appointments/appointments.ts,
-- both read the conflicting appointment's duration via
-- `JOIN public.services s ON s.id = a.service_id` (or `services!inner(...)`
-- on the TS side). 20260715130000 made service_id nullable with
-- ON DELETE SET NULL specifically so deleting a service no longer blocks
-- on its past appointments — but that means any appointment whose service
-- was later deleted has service_id = NULL, and an INNER JOIN silently
-- drops it from the conflict check entirely. A still-active (pending/
-- confirmed) appointment for a deleted service becomes invisible to
-- double-booking protection: a second, different customer can be booked
-- into the exact same slot. max_per_day counting is unaffected (it never
-- joined services), only slot-overlap detection breaks.
--
-- Fix: snapshot duration_minutes onto the appointment row at
-- booking/reschedule time, exactly like service_name/service_name_ar
-- already are (same migration, same reasoning). The conflict/availability
-- queries then read appointments.duration_minutes directly and no longer
-- need to join services at all, so a deleted service can't hide an
-- existing booking from them.
--
-- Fix 2: the per-user "max 2 active appointments" cap could be bypassed
-- by a race between two concurrent booking requests for DIFFERENT dates.
-- create_appointment's only serialization is
-- `pg_advisory_xact_lock(42, hashtext(p_appointment_date::text))`, keyed
-- on the target date — two concurrent calls for two different dates never
-- contend for that lock, so both can read the same (stale) active-count
-- before either commits, and both pass MAX_APPOINTMENTS_REACHED, leaving
-- the user with 3+ active appointments. Reproduced locally with two
-- genuinely concurrent transactions targeting different dates for the
-- same user.
--
-- Fix: a second advisory lock, keyed on the user id (namespace 43, kept
-- distinct from the date lock's namespace 42), acquired before the
-- active-count check. Every caller acquires the two locks in the same
-- fixed order (date lock, then user lock), so this cannot deadlock
-- against the date lock. reschedule_appointment doesn't need this lock —
-- it never changes how many active appointments a user has.
-- =============================================


-- ═══════════════════════════════════════════════
-- 1. Snapshot duration_minutes onto appointments
-- ═══════════════════════════════════════════════

ALTER TABLE public.appointments ADD COLUMN duration_minutes INTEGER;

UPDATE public.appointments a
SET duration_minutes = s.duration_minutes
FROM public.services s
WHERE s.id = a.service_id
  AND a.duration_minutes IS NULL;

-- Appointments whose service was already deleted before this migration
-- (service_id already NULL, e.g. from before the fix this migration
-- applies) have no live join left to recover a real duration from — 30
-- minutes matches the fallback already used elsewhere in the app for
-- exactly this situation (getAvailableTimes' `?? 30`,
-- findConflictingAppointments' `?? 30`).
UPDATE public.appointments
SET duration_minutes = 30
WHERE duration_minutes IS NULL;

ALTER TABLE public.appointments ALTER COLUMN duration_minutes SET NOT NULL;


-- ═══════════════════════════════════════════════
-- 2. create_appointment — snapshot duration_minutes, add the user-scoped
--    advisory lock, and drop the services join from the conflict check.
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

  PERFORM pg_advisory_xact_lock(42, hashtext(p_appointment_date::text));

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

  -- No join to services: duration comes from each existing appointment's
  -- own snapshot, so a booking is never invisible to this check just
  -- because its service was since deleted.
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

  INSERT INTO public.appointments (
    user_id, service_id, appointment_date, appointment_time,
    customer_name, customer_phone, notes, status, total_price,
    service_name, service_name_ar, duration_minutes
  ) VALUES (
    p_user_id, p_service_id, p_appointment_date, p_appointment_time,
    v_customer_name, v_customer_phone, v_notes, 'confirmed', v_service.price,
    v_service.name, v_service.name_ar, v_service.duration_minutes
  )
  RETURNING id INTO v_appointment_id;

  RETURN v_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT) TO service_role;


-- ═══════════════════════════════════════════════
-- 3. reschedule_appointment — same duration snapshot + join removal.
--    No user-lock needed: rescheduling never changes how many active
--    appointments this user has.
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

  PERFORM pg_advisory_xact_lock(42, hashtext(p_appointment_date::text));

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

  -- No join to services: duration comes from each existing appointment's
  -- own snapshot, so a booking is never invisible to this check just
  -- because its service was since deleted.
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
      duration_minutes = v_service.duration_minutes
  WHERE id = p_appointment_id;

  RETURN p_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_appointment(UUID, UUID, UUID, DATE, TIME) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(UUID, UUID, UUID, DATE, TIME) TO service_role;
