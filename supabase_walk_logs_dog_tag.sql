-- =====================================================================
-- Rocky's Retreat and Rambles — walk_logs.dog_id for stand-alone photos
-- =====================================================================
-- Adds a nullable dog_id column so admin-posted photos can be directly
-- tagged to a dog (the client's dashboard dog page uses this to show
-- "photos of your dog" regardless of whether a booking existed).
--
-- Also relaxes booking_id to nullable — admins can upload ad-hoc photos
-- (e.g. a cute meet-and-greet moment) that aren't tied to a booking.
--
-- Safe to run multiple times.
-- =====================================================================

alter table if exists public.walk_logs
  add column if not exists dog_id uuid references public.dogs(id) on delete set null;

-- Make booking_id nullable (originally NOT NULL). Stand-alone posts need no booking.
alter table if exists public.walk_logs alter column booking_id drop not null;

-- Index for fast "photos of dog X" lookups
create index if not exists idx_walk_logs_dog on public.walk_logs (dog_id, created_at desc)
  where dog_id is not null;

-- Update RLS so clients can see stand-alone photos of THEIR dogs (previously
-- they could only see walk_logs via the booking join). Admins already see all.
drop policy if exists "walk_logs_view_by_dog_owner" on public.walk_logs;
create policy "walk_logs_view_by_dog_owner" on public.walk_logs
  for select to authenticated
  using (
    dog_id is not null and exists (
      select 1 from public.dogs d
      where d.id = walk_logs.dog_id
        and (
          d.owner_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
        )
    )
  );

-- =====================================================================
-- DONE
-- =====================================================================
