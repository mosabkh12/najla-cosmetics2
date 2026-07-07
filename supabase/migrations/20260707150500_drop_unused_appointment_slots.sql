-- appointment_slots and appointments.slot_id predate the current
-- availability_settings-based booking system (weekly hours + breaks +
-- slot_interval, enforced inside create_appointment/reschedule_appointment).
-- Neither is referenced anywhere in the application — dead schema left
-- over from an earlier design.
alter table public.appointments
  drop column if exists slot_id;

drop table if exists public.appointment_slots;
