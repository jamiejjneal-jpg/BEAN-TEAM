-- =====================================================================
-- Rocky's Retreat and Rambles — Harden admin-only tables (RLS)
-- =====================================================================
-- Purpose: make absolutely sure that even if a non-admin user bypasses the
-- UI route guard (by typing `/admin/...` in the URL, or replaying an API
-- call from the browser devtools), the database itself refuses to return
-- admin-only data.
--
-- Tables locked down: audit_log, email_automations, site_images,
-- walker_payouts. These are the four admin-only tables — clients and
-- walkers have zero legitimate reason to read or write them.
--
-- All other tables (bookings, dogs, walk_logs, reviews, notifications,
-- profiles, walker_profiles, walker_schedule) already have role-aware
-- RLS from the base migration.
--
-- Safe to run multiple times — every policy is drop-if-exists first.
-- =====================================================================

-- Helper to detect if the current caller is an active admin ----------------
-- (inline `exists` is used inside each policy rather than a function so it
-- works on clean Supabase projects without needing `security definer`
-- helpers.)

-- ---------- AUDIT LOG ----------
alter table if exists public.audit_log enable row level security;

drop policy if exists "Audit log viewable by admins"   on public.audit_log;
drop policy if exists "Audit log admins can insert"    on public.audit_log;
drop policy if exists "Audit log service role"         on public.audit_log;

create policy "Audit log viewable by admins" on public.audit_log
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Audit log admins can insert" on public.audit_log
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Audit log service role" on public.audit_log
  for all to service_role using (true) with check (true);

-- ---------- EMAIL AUTOMATIONS ----------
alter table if exists public.email_automations enable row level security;

drop policy if exists "email_automations_read_all"     on public.email_automations;
drop policy if exists "email_automations_admin_write"  on public.email_automations;
drop policy if exists "email_automations_admin_read"   on public.email_automations;

-- Previously read-all-authenticated so the triggerAutoEmail helper could
-- check the toggle. Tightened: admins see EVERY row, non-admins only see
-- enabled/disabled flags for the few keys that fire during signup so the
-- client-side helper still works. Here we simply restrict to admins and
-- move the pre-signup "is welcome_client enabled?" check into the
-- edge function (bulk-mail) which uses service_role — see notes below.
create policy "email_automations_admin_read" on public.email_automations
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "email_automations_admin_write" on public.email_automations
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- SITE IMAGES ----------
alter table if exists public.site_images enable row level security;

-- Public pages (landing / pricing / login / register) read `site_images`
-- anonymously, so reads MUST stay open. Writes are admin-only.
drop policy if exists "Site images public read"     on public.site_images;
drop policy if exists "Site images admin write"     on public.site_images;
drop policy if exists "Site images service role"    on public.site_images;

create policy "Site images public read" on public.site_images
  for select to anon, authenticated using (true);

create policy "Site images admin write" on public.site_images
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Site images service role" on public.site_images
  for all to service_role using (true) with check (true);

-- ---------- WALKER PAYOUTS ----------
alter table if exists public.walker_payouts enable row level security;

drop policy if exists "Payouts viewable by admin or walker"  on public.walker_payouts;
drop policy if exists "Payouts admins write"                 on public.walker_payouts;
drop policy if exists "Payouts service role"                 on public.walker_payouts;

-- Walkers can see their own payouts; admins see everything.
create policy "Payouts viewable by admin or walker" on public.walker_payouts
  for select to authenticated
  using (
    walker_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Payouts admins write" on public.walker_payouts
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Payouts service role" on public.walker_payouts
  for all to service_role using (true) with check (true);

-- ---------- GALLERY COMMENTS (if present) ----------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='walk_log_comments') then
    execute 'alter table public.walk_log_comments enable row level security';

    execute 'drop policy if exists "comments_view"   on public.walk_log_comments';
    execute 'drop policy if exists "comments_insert" on public.walk_log_comments';
    execute 'drop policy if exists "comments_update" on public.walk_log_comments';
    execute 'drop policy if exists "comments_delete" on public.walk_log_comments';

    -- You can see a comment if you can see the underlying walk_log.
    execute $pol$create policy "comments_view" on public.walk_log_comments for select to authenticated using (
      exists (
        select 1 from public.walk_logs wl
        join public.bookings b on b.id = wl.booking_id
        where wl.id = walk_log_comments.walk_log_id
          and (b.client_id = auth.uid() or b.walker_id = auth.uid()
               or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      )
    )$pol$;

    execute $pol$create policy "comments_insert" on public.walk_log_comments for insert to authenticated
      with check (author_id = auth.uid())$pol$;
    execute $pol$create policy "comments_update" on public.walk_log_comments for update to authenticated
      using (author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))$pol$;
    execute $pol$create policy "comments_delete" on public.walk_log_comments for delete to authenticated
      using (author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))$pol$;
  end if;
end $$;

-- =====================================================================
-- IMPORTANT AFTER-NOTE
-- =====================================================================
-- Because email_automations is now admin-only, the `triggerAutoEmail`
-- frontend helper can no longer read the toggle directly for NON-ADMIN
-- flows (e.g. a client signing themselves up on /register). In that case
-- the read silently returns nothing and no automation email is sent.
--
-- Fix: move the read INTO the `bulk-mail` edge function (which uses the
-- service role and bypasses RLS). The helper simply asks bulk-mail to
-- "send template X if its toggle is on" — the edge function decides.
-- This is shipped in the same app update — no extra action required.
-- =====================================================================
