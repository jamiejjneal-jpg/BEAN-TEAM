-- =====================================================
-- PawTrail - Gallery photo comments + admin uploads
-- Paste into Supabase SQL Editor (idempotent)
-- =====================================================

-- 1. Comments on walk-log photos
create table if not exists public.walk_log_comments (
  id uuid primary key default gen_random_uuid(),
  walk_log_id uuid references public.walk_logs(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists idx_walk_log_comments_log on public.walk_log_comments(walk_log_id);
create index if not exists idx_walk_log_comments_created on public.walk_log_comments(created_at desc);

alter table public.walk_log_comments enable row level security;

-- Admins, plus the client who owns the booking, plus the walker, can read
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='walk_log_comments' and policyname='read walk log comments') then
    create policy "read walk log comments"
      on public.walk_log_comments for select to authenticated
      using (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
        or exists (
          select 1 from public.walk_logs wl
          join public.bookings b on b.id = wl.booking_id
          where wl.id = walk_log_comments.walk_log_id
            and (b.client_id = auth.uid() or b.walker_id = auth.uid())
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='walk_log_comments' and policyname='insert walk log comments') then
    create policy "insert walk log comments"
      on public.walk_log_comments for insert to authenticated
      with check (
        author_id = auth.uid()
        and (
          exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
          or exists (
            select 1 from public.walk_logs wl
            join public.bookings b on b.id = wl.booking_id
            where wl.id = walk_log_id
              and (b.client_id = auth.uid() or b.walker_id = auth.uid())
          )
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='walk_log_comments' and policyname='delete walk log comments') then
    create policy "delete walk log comments"
      on public.walk_log_comments for delete to authenticated
      using (
        author_id = auth.uid()
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
      );
  end if;
end $$;

-- 2. Allow admins to INSERT walk_logs (for admin-uploaded photos to a gallery).
-- The existing RLS likely only lets the walker on the booking insert. Extend it.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='walk_logs' and policyname='admins can insert walk logs') then
    create policy "admins can insert walk logs"
      on public.walk_logs for insert to authenticated
      with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='walk_logs' and policyname='admins can delete walk logs') then
    create policy "admins can delete walk logs"
      on public.walk_logs for delete to authenticated
      using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='walk_logs' and policyname='admins can update walk logs') then
    create policy "admins can update walk logs"
      on public.walk_logs for update to authenticated
      using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
      with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
  end if;
end $$;

-- 3. Add a caption field on walk_logs so admins/walkers can caption photos
alter table public.walk_logs add column if not exists caption text default '';
