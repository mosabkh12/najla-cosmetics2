-- Removes the old .ics calendar subscription feature entirely, including
-- the secret token column it stored on business_settings.
alter table public.business_settings
  drop column if exists calendar_feed_token;
