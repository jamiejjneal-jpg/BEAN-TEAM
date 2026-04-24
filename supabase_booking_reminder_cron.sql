-- =====================================================================
-- Rocky's Retreat and Rambles — Booking reminder cron + column
-- =====================================================================
-- What this does:
--   1. Adds `reminder_sent_at` to `bookings` so the edge function never
--      double-sends a reminder.
--   2. Enables the `pg_cron` and `pg_net` Postgres extensions (both are
--      available on every Supabase project — they're OFF by default).
--   3. Schedules a daily job at 09:00 UTC that calls your
--      `booking-reminder` Edge Function with the CRON_SECRET header.
--
-- BEFORE you run this SQL:
--   a) Decide on a CRON_SECRET string (any long random value).
--      e.g. openssl rand -hex 24   →   3f4d...long random hex...
--   b) REPLACE the three TEMPLATE tokens below:
--      <YOUR_PROJECT_REF>   e.g.  abcdwxyz (from your Supabase dashboard URL)
--      <YOUR_CRON_SECRET>   the secret you just picked
--   c) In Supabase → Edge Functions → Secrets, add:
--      CRON_SECRET = <the same secret>
--   d) Deploy the `booking-reminder` function (see deploy guide).
--
-- Safe to run multiple times — the job is unscheduled and re-created.
-- =====================================================================

-- 1) Column to track sent reminders
alter table if exists public.bookings
  add column if not exists reminder_sent_at timestamptz;

-- 2) Extensions (no-op if already enabled)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Unschedule any previous version of the job (by name), then re-create
do $$
begin
  if exists (select 1 from cron.job where jobname = 'booking-reminder-daily') then
    perform cron.unschedule('booking-reminder-daily');
  end if;
end $$;

-- Daily at 09:00 UTC → adjust the cron expression to your preferred run time.
-- Cron format: minute hour day-of-month month day-of-week
select cron.schedule(
  'booking-reminder-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://<YOUR_PROJECT_REF>.functions.supabase.co/booking-reminder',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'x-cron-secret',  '<YOUR_CRON_SECRET>'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Quick sanity-check views — run these separately to confirm:
-- select jobid, jobname, schedule, active from cron.job;
-- select * from cron.job_run_details order by start_time desc limit 5;

-- =====================================================================
-- DONE — reminders run automatically every morning at 09:00 UTC.
-- To change the time, pick a new cron expression and re-run this block.
-- =====================================================================
