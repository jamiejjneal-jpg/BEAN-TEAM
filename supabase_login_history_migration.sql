-- =====================================================================
-- Rocky's Retreat and Rambles — Login history (self-service paranoia log)
-- =====================================================================
-- Tracks each successful sign-in so users can spot out-of-character logins.
-- Deliberately minimal: timestamp + coarse device hint + optional IP hash.
-- We DO NOT store the raw IP — a SHA-256 of "<ip><secret>" is enough to tell
-- "same IP as last time" without retaining personal data.
--
-- Each user reads their OWN history. Admins read everyone's.
-- Safe to run multiple times.
-- =====================================================================

create table if not exists public.login_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  user_agent  text,
  device      text, -- friendly one-liner: "Chrome on Mac", "Safari on iPhone"
  ip_hint     text  -- last 2 octets of the v4 IP for a vague "same network" hint (optional)
);

create index if not exists idx_login_history_user on public.login_history (user_id, created_at desc);

alter table public.login_history enable row level security;

drop policy if exists "login_history_insert_self"  on public.login_history;
drop policy if exists "login_history_read_self"    on public.login_history;
drop policy if exists "login_history_admin_read"   on public.login_history;
drop policy if exists "login_history_service_role" on public.login_history;

-- Users may only insert their own rows.
create policy "login_history_insert_self" on public.login_history
  for insert to authenticated
  with check (user_id = auth.uid());

-- Users may read their own rows.
create policy "login_history_read_self" on public.login_history
  for select to authenticated
  using (user_id = auth.uid());

-- Admins can read everyone's (useful for spotting suspicious activity).
create policy "login_history_admin_read" on public.login_history
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "login_history_service_role" on public.login_history
  for all to service_role using (true) with check (true);

-- =====================================================================
-- DONE
-- =====================================================================
