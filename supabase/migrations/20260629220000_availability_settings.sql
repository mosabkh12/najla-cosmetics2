-- =============================================
-- Availability Settings
-- Replaces manual slot management with
-- configurable booking availability rules.
-- =============================================

CREATE TABLE IF NOT EXISTS public.availability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_hours JSONB NOT NULL DEFAULT '{"0":{"enabled":true,"open":"09:00","close":"19:00"},"1":{"enabled":true,"open":"09:00","close":"19:00"},"2":{"enabled":true,"open":"09:00","close":"19:00"},"3":{"enabled":true,"open":"09:00","close":"19:00"},"4":{"enabled":true,"open":"09:00","close":"19:00"},"5":{"enabled":true,"open":"09:00","close":"15:00"},"6":{"enabled":false,"open":"09:00","close":"19:00"}}',
  breaks JSONB NOT NULL DEFAULT '[]',
  slot_interval INTEGER NOT NULL DEFAULT 30,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  max_per_day INTEGER,
  closed_dates JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default row
INSERT INTO public.availability_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.availability_settings);

GRANT SELECT ON public.availability_settings TO anon, authenticated;
GRANT ALL ON public.availability_settings TO service_role;

ALTER TABLE public.availability_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "availability_anon_read" ON public.availability_settings
  FOR SELECT TO anon USING (true);
CREATE POLICY "availability_auth_read" ON public.availability_settings
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER availability_settings_updated_at
  BEFORE UPDATE ON public.availability_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.availability_settings
  ADD CONSTRAINT slot_interval_positive CHECK (slot_interval > 0),
  ADD CONSTRAINT buffer_non_negative CHECK (buffer_minutes >= 0),
  ADD CONSTRAINT max_per_day_positive CHECK (max_per_day IS NULL OR max_per_day > 0);
