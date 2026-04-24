-- =====================================================================
-- Rocky's Retreat and Rambles — Schedule the notification-digest cron job
-- =====================================================================
-- Runs every day at 08:00 UTC. The function itself decides internally
-- whether to also run the weekly roll-up (Sundays only).
--
-- BEFORE running: make sure you've already scheduled the booking-reminder
-- cron job (which also enables pg_cron + pg_net). If you have, those
-- extensions are already on and you can just paste this block.
--
-- REPLACE the two placeholders below with YOUR values, same ones you
-- already used for booking-reminder:
--   <YOUR_PROJECT_REF>    e.g. udoeczxwrnmqbxtzybmt
--   <YOUR_CRON_SECRET>    the same secret string you set as CRON_SECRET
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'notification-digest-daily') then
    perform cron.unschedule('notification-digest-daily');
  end if;
end $$;

select cron.schedule(
  'notification-digest-daily',
  '0 8 * * *',  -- daily at 08:00 UTC
  $$
  select net.http_post(
    url     := 'https://<YOUR_PROJECT_REF>.functions.supabase.co/notification-digest',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', '<YOUR_CRON_SECRET>'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
