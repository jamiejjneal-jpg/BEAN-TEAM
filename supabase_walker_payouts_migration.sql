-- =====================================================
-- PawTrail - Walker Payouts Migration
-- Run in Supabase SQL Editor (idempotent; safe to re-run)
-- =====================================================

create table if not exists public.walker_payouts (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid references public.profiles(id) on delete cascade not null,
  week_start date not null,
  amount numeric(10,2) not null default 0,
  walks_count integer not null default 0,
  total_minutes integer not null default 0,
  paid_at timestamptz default now(),
  paid_by uuid references public.profiles(id),
  notes text default '',
  created_at timestamptz default now(),
  unique(walker_id, week_start)
);

create index if not exists idx_walker_payouts_walker on public.walker_payouts(walker_id);
create index if not exists idx_walker_payouts_week on public.walker_payouts(week_start);

-- RLS: only admins can read/write payouts. We go through service role in API
-- routes, so keep RLS on but lock everything down.
alter table public.walker_payouts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='walker_payouts'
      and policyname='admins manage payouts'
  ) then
    create policy "admins manage payouts"
      on public.walker_payouts
      for all
      to authenticated
      using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
      with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
  end if;
end $$;
