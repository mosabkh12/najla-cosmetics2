-- A random secret token protecting the admin's private calendar
-- subscription feed (an .ics URL the admin adds to their phone's Calendar
-- app so appointments show up with native reminders/lock-screen alerts).
-- Nullable: the feed is inert until an admin first requests it and one
-- gets generated.
alter table public.business_settings
  add column if not exists calendar_feed_token text;

