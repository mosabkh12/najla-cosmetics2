-- =============================================
-- Phase 4: admin appointment status changes are not race-safe
--
-- updateAppointmentStatus (src/api/appointments/appointments.ts) writes
-- appointments.status directly via a plain UPDATE. Every other write to
-- this table (create_appointment, reschedule_appointment) is already a
-- SECURITY DEFINER RPC that re-validates the slot (hours, breaks, closed
-- dates, past-date, overlap with every other active appointment) inside
-- a Postgres advisory-lock-serialized transaction. The admin path never
-- did any of that: an admin moving a cancelled/completed appointment
-- back to pending/confirmed can silently recreate a double-booking, and
-- two concurrent admin/customer actions on the same date/slot are not
-- serialized against each other at all for this path.
--
-- Every OTHER admin status change (marking active -> terminal, or a
-- terminal <-> terminal correction) never re-occupies a slot and needs
-- no re-validation — this migration only adds the check where it's
-- actually needed: reactivating an appointment (cancelled/completed ->
-- pending/confirmed).
--
-- Transition policy (see accompanying report for full reasoning):
--   - Any transition NOT moving {cancelled,completed} -> {pending,
--     confirmed}: freely allowed, no re-validation (matches existing,
--     intentional admin-correction flexibility — see
--     20260706220000_allow_full_appointment_status_transitions.sql).
--   - cancelled -> completed: blocked outright (INVALID_STATUS_TRANSITION)
--     — a cancelled appointment never took place, so it cannot become
--     "completed" without first being reactivated to an active status.
--   - {cancelled,completed} -> {pending,confirmed}: reactivation — full
--     re-validation using exactly the same rules, defaults, and
--     Asia/Jerusalem timezone handling as create_appointment/
--     reschedule_appointment, using the appointment's own
--     duration_minutes snapshot (never a live join to services, for the
--     same reason 20260719120000 removed that join from the other two
--     RPCs), serialized with the same pg_advisory_xact_lock(42, ...)
--     namespace so a concurrent create/reschedule/reactivation for the
--     same date cannot race this one.
-- =============================================

CREATE OR REPLACE FUNCTION public.admin_update_appointment_status(
  p_appointment_id UUID,
  p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt RECORD;
  v_new_status public.appointment_status;
  v_is_reactivation BOOLEAN;
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
  -- Lock the target row before validating or updating anything else —
  -- serializes two concurrent admin calls against the SAME appointment,
  -- and NULL p_appointment_id simply matches no row (id = NULL is never
  -- true), falling through to NOT FOUND below rather than needing a
  -- separate NULL check.
  SELECT id, status, appointment_date, appointment_time, duration_minutes
  INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND';
  END IF;

  IF p_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  BEGIN
    v_new_status := p_status::public.appointment_status;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END;

  IF v_appt.status = 'cancelled' AND v_new_status = 'completed' THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION';
  END IF;

  v_is_reactivation := v_appt.status IN ('cancelled', 'completed')
    AND v_new_status IN ('pending', 'confirmed');

  IF v_is_reactivation THEN
    -- Same per-date serialization create_appointment/reschedule_appointment
    -- use, keyed on this appointment's own date — any concurrent
    -- create/reschedule/reactivation targeting the same date blocks here
    -- until this transaction commits or rolls back, so the
    -- read-conflicts-then-update sequence below can never race a
    -- concurrent booking the same way normal creation/reschedule can't.
    PERFORM pg_advisory_xact_lock(42, hashtext(v_appt.appointment_date::text));

    SELECT weekly_hours, breaks, slot_interval, buffer_minutes, max_per_day, closed_dates
    INTO v_weekly_hours, v_breaks, v_interval, v_buffer, v_max_per_day, v_closed_dates
    FROM public.availability_settings
    LIMIT 1;

    -- Defaults mirror DEFAULT_WEEKLY in src/api/slots/slots.ts and the
    -- identical fallback in create_appointment/reschedule_appointment,
    -- used only if no settings row exists yet.
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

    IF v_closed_dates ? v_appt.appointment_date::text THEN
      RAISE EXCEPTION 'APPOINTMENT_ON_CLOSED_DATE';
    END IF;

    v_day := v_weekly_hours -> EXTRACT(DOW FROM v_appt.appointment_date)::TEXT;
    IF v_day IS NULL OR COALESCE((v_day->>'enabled')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'APPOINTMENT_ON_CLOSED_DATE';
    END IF;

    v_open := (split_part(v_day->>'open', ':', 1)::int * 60) + split_part(v_day->>'open', ':', 2)::int;
    v_close := (split_part(v_day->>'close', ':', 1)::int * 60) + split_part(v_day->>'close', ':', 2)::int;

    v_requested_start := (EXTRACT(HOUR FROM v_appt.appointment_time)::int * 60)
      + EXTRACT(MINUTE FROM v_appt.appointment_time)::int;
    v_requested_end := v_requested_start + v_appt.duration_minutes;

    IF v_requested_start < v_open OR v_requested_end > v_close THEN
      RAISE EXCEPTION 'APPOINTMENT_OUTSIDE_WORKING_HOURS';
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_breaks) b
      WHERE v_requested_start < ((split_part(b->>'end', ':', 1)::int * 60) + split_part(b->>'end', ':', 2)::int)
        AND v_requested_end > ((split_part(b->>'start', ':', 1)::int * 60) + split_part(b->>'start', ':', 2)::int)
    ) THEN
      RAISE EXCEPTION 'APPOINTMENT_OUTSIDE_WORKING_HOURS';
    END IF;

    v_today := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
    v_now_minutes := (EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Jerusalem'))::int * 60)
                   + EXTRACT(MINUTE FROM (now() AT TIME ZONE 'Asia/Jerusalem'))::int;

    IF v_appt.appointment_date < v_today THEN
      RAISE EXCEPTION 'APPOINTMENT_IN_PAST';
    END IF;
    IF v_appt.appointment_date = v_today AND v_requested_start < v_now_minutes + 30 THEN
      RAISE EXCEPTION 'APPOINTMENT_IN_PAST';
    END IF;

    -- Business-wide daily cap, excluding this appointment itself —
    -- same exclusion reschedule_appointment applies to its own
    -- max_per_day count.
    SELECT count(*) INTO v_conflict_count
    FROM public.appointments a
    WHERE a.appointment_date = v_appt.appointment_date
      AND a.status <> 'cancelled'
      AND a.id <> p_appointment_id;

    IF v_max_per_day IS NOT NULL AND v_conflict_count >= v_max_per_day THEN
      RAISE EXCEPTION 'APPOINTMENT_TIME_CONFLICT';
    END IF;

    -- Same overlap check as create_appointment/reschedule_appointment:
    -- reads every other active appointment's own duration_minutes
    -- snapshot (no join to services, so a deleted service can't hide a
    -- booking from this check), and excludes this appointment from its
    -- own conflict check.
    IF EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.appointment_date = v_appt.appointment_date
        AND a.status <> 'cancelled'
        AND a.id <> p_appointment_id
        AND v_requested_start < (
          (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int)
          + a.duration_minutes + v_buffer
        )
        AND (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int)
          < (v_requested_end + v_buffer)
    ) THEN
      RAISE EXCEPTION 'APPOINTMENT_TIME_CONFLICT';
    END IF;
  END IF;

  UPDATE public.appointments
  SET status = v_new_status
  WHERE id = p_appointment_id;

  RETURN p_appointment_id;
END;
$$;

-- Server-only, exactly like create_appointment/reschedule_appointment:
-- reachable only via the service-role client from the requireAdmin-gated
-- updateAppointmentStatus server function. A normal authenticated user
-- (or anon) calling this RPC directly via PostgREST/supabase-js gets a
-- permission-denied error before the function body ever runs — this is
-- the RPC's actual admin-authorization boundary, matching the pattern
-- already established and audited for every other server-only RPC in
-- this schema.
REVOKE ALL ON FUNCTION public.admin_update_appointment_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_appointment_status(UUID, TEXT) TO service_role;
