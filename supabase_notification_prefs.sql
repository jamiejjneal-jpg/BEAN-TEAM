-- =====================================================================
-- Rocky's Retreat and Rambles — Notifications prefs + photo alerts
-- =====================================================================
-- 1. Widens notifications.type so new kinds (photo_added, etc.) can be
--    inserted without hitting the narrow CHECK from the base migration.
-- 2. Creates notification_prefs — one row per user holding their email /
--    in-app toggles for each kind of notification. Clients own their own
--    row; admins read all for support.
--
-- Safe to run multiple times.
-- =====================================================================

-- 1) Drop narrow CHECK on notifications.type
do $$
declare
  c record;
begin
  for c in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name
     and tc.table_schema   = ccu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name   = 'notifications'
      and tc.constraint_type = 'CHECK'
      and ccu.column_name = 'type'
  loop
    execute format('alter table public.notifications drop constraint %I', c.constraint_name);
  end loop;
end $$;

-- 2) notification_prefs table
create table if not exists public.notification_prefs (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  -- In-app (bell) toggles
  inapp_booking     boolean not null default true,
  inapp_walk_update boolean not null default true,
  inapp_photo_added boolean not null default true,
  inapp_review      boolean not null default true,
  inapp_system      boolean not null default true,
  -- Email toggles
  email_booking     boolean not null default true,
  email_walk_update boolean not null default false,
  email_photo_added boolean not null default false,
  email_review      boolean not null default false,
  email_system      boolean not null default true,
  -- Pause-all
  paused_until      timestamptz,
  updated_at        timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists "notif_prefs_read_self"    on public.notification_prefs;
drop policy if exists "notif_prefs_upsert_self"  on public.notification_prefs;
drop policy if exists "notif_prefs_admin_read"   on public.notification_prefs;
drop policy if exists "notif_prefs_service_role" on public.notification_prefs;

create policy "notif_prefs_read_self" on public.notification_prefs
  for select to authenticated using (user_id = auth.uid());

create policy "notif_prefs_upsert_self" on public.notification_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notif_prefs_admin_read" on public.notification_prefs
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "notif_prefs_service_role" on public.notification_prefs
  for all to service_role using (true) with check (true);

-- =====================================================================
-- DONE
-- =====================================================================
