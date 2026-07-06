-- Booking no longer requires manual admin confirmation: a new appointment
-- is created directly as 'confirmed' instead of 'pending', and rescheduling
-- keeps it 'confirmed' instead of resetting it back to 'pending'. Admin's
-- job is now just to mark a completed/past appointment 'completed', or
-- 'cancelled' if it doesn't happen — never to "approve" a booking first.
-- 'pending' remains a legal status value (existing rows, and the admin
-- dashboard's full any-to-any status control both still allow it), it's
-- simply no longer the value new bookings start at.
--
-- Both function bodies below are otherwise byte-for-byte identical to
-- their definitions in 20260704180000_secure_appointment_booking.sql —
-- only the single status literal each sets is changed.

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
  IF p_appointment_date = v_today AND v_requested_start < v_now_minutes THEN
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
    v_customer_name, v_customer_phone, v_notes, 'confirmed', v_service.price
  )
  RETURNING id INTO v_appointment_id;

  RETURN v_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT) TO service_role;


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
      status = 'confirmed'
  WHERE id = p_appointment_id;

  RETURN p_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_appointment(UUID, UUID, UUID, DATE, TIME) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(UUID, UUID, UUID, DATE, TIME) TO service_role;
