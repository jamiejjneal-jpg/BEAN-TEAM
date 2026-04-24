-- =====================================================================
-- Rocky's Retreat and Rambles — Email automations toggles
-- =====================================================================
-- Stores admin-controlled toggles: "when X happens, automatically send the
-- Y template". Only Admins can read/write. Rows are created on-demand.
-- Safe to run multiple times.
-- =====================================================================

create table if not exists public.email_automations (
  template_key     text primary key,
  enabled          boolean not null default false,
  subject_override text,
  html_override    text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null
);

-- If you've already created this table from the earlier migration, add the
-- two override columns (idempotent).
alter table public.email_automations add column if not exists subject_override text;
alter table public.email_automations add column if not exists html_override    text;

alter table public.email_automations enable row level security;

-- Everyone authenticated can READ (so the frontend helper can check toggles
-- before sending — e.g. on client self-signup). Only admins can WRITE.
drop policy if exists "email_automations_read_all" on public.email_automations;
create policy "email_automations_read_all" on public.email_automations
  for select to authenticated using (true);

drop policy if exists "email_automations_admin_write" on public.email_automations;
create policy "email_automations_admin_write" on public.email_automations
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Seed all five automation keys as disabled (admin can flip them on in the UI)
insert into public.email_automations (template_key, enabled) values
  ('welcome_client',  false),
  ('welcome_walker',  false),
  ('leaving_client',  false),
  ('leaving_walker',  false),
  ('booking_reminder', false)
on conflict (template_key) do nothing;

-- =====================================================================
-- DONE
-- =====================================================================
