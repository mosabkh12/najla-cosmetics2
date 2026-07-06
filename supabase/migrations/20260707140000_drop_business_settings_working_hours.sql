-- The "Working Hours" field on the admin Settings page saved into this
-- column, but nothing on the site ever displayed it — the real, bookable
-- weekly hours live entirely in availability_settings.weekly_hours
-- (managed on the separate Availability admin page). Having two
-- disconnected "hours" fields was pure confusion (the customer-facing
-- pages hardcoded a third, often-wrong version). Dropping the dead column
-- now that nothing reads or writes it.
alter table public.business_settings
  drop column if exists working_hours;
