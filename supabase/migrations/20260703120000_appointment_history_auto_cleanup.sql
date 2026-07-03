-- =============================================
-- Appointment History Auto-Cleanup
-- Permanently deletes completed/cancelled
-- appointments once they are older than the
-- 14-day retention window.
-- =============================================

CREATE OR REPLACE FUNCTION public.purge_old_appointments()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.appointments
  WHERE status IN ('completed', 'cancelled')
    AND appointment_date < (CURRENT_DATE - INTERVAL '14 days');
$$;

-- Best-effort daily schedule via pg_cron, if the extension is enabled on
-- this project. If it isn't, the app itself also runs this cleanup lazily
-- on every appointments read (see src/api/appointments/appointments.ts),
-- so the 14-day retention policy is enforced either way.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-old-appointments-daily';
    PERFORM cron.schedule(
      'purge-old-appointments-daily',
      '0 3 * * *',
      'SELECT public.purge_old_appointments();'
    );
  END IF;
END $$;
