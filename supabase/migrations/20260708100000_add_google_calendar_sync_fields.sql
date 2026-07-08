-- One-way sync state from this app's appointments to Google Calendar
-- (Najla → Google only; Google is never read back, and this app's
-- database stays the single source of truth). All three are nullable:
-- an appointment that hasn't synced yet — including every existing row,
-- and any appointment created while Google Calendar sync isn't
-- configured at all — simply has nulls here, with zero effect on
-- booking/availability logic either way.
alter table public.appointments
  add column if not exists google_event_id text,
  add column if not exists google_calendar_synced_at timestamptz,
  add column if not exists google_calendar_sync_error text;
