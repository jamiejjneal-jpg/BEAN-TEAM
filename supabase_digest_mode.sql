-- =====================================================================
-- Rocky's Retreat and Rambles — Email digest mode
-- =====================================================================
-- Adds a digest_mode column so users can opt to receive a batched summary
-- instead of per-event emails.
--
-- Modes:
--   'instant' — email the moment the event happens (current behaviour)
--   'daily'   — email once per day (cron @ 08:00 UTC)
--   'weekly'  — email once per week (cron @ Sunday 08:00 UTC)
--
-- Adds `emailed_at` to notifications so the digest cron never double-sends
-- the same event.
--
-- Safe to run multiple times.
-- =====================================================================

alter table if exists public.notification_prefs
  add column if not exists digest_mode text not null default 'instant';

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema='public' and constraint_name='notification_prefs_digest_mode_chk'
  ) then
    alter table public.notification_prefs
      add constraint notification_prefs_digest_mode_chk
      check (digest_mode in ('instant','daily','weekly'));
  end if;
end $$;

alter table if exists public.notifications
  add column if not exists emailed_at timestamptz;

create index if not exists idx_notifications_digest_pending
  on public.notifications (user_id, emailed_at, created_at)
  where emailed_at is null;

-- =====================================================================
-- DONE
-- =====================================================================
