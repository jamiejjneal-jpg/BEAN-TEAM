-- =====================================================
-- PawTrail - Profile & Admin Enhancements Migration
-- Run in Supabase SQL Editor (idempotent; safe to re-run)
-- =====================================================

-- 1. Client profile extensions: keycode, access notes, emergency contact
alter table public.profiles add column if not exists keycode text default '';
alter table public.profiles add column if not exists access_notes text default '';
alter table public.profiles add column if not exists emergency_contact text default '';
alter table public.profiles add column if not exists emergency_phone text default '';
alter table public.profiles add column if not exists emergency_relation text default '';

-- 2. Dog profile extensions (in case previous migration was partial)
alter table public.dogs add column if not exists off_lead boolean default false;
alter table public.dogs add column if not exists vet_name text default '';
alter table public.dogs add column if not exists vet_phone text default '';
alter table public.dogs add column if not exists vet_address text default '';
alter table public.dogs add column if not exists vaccinations_up_to_date boolean default false;
alter table public.dogs add column if not exists vaccination_details text default '';
alter table public.dogs add column if not exists food_type text default '';
alter table public.dogs add column if not exists food_schedule text default '';
alter table public.dogs add column if not exists allergies text default '';
alter table public.dogs add column if not exists neutered boolean default false;
alter table public.dogs add column if not exists microchipped boolean default false;
alter table public.dogs add column if not exists microchip_number text default '';
alter table public.dogs add column if not exists emergency_contact text default '';
alter table public.dogs add column if not exists emergency_phone text default '';
alter table public.dogs add column if not exists temperament text default '';
alter table public.dogs add column if not exists good_with_dogs boolean default true;
alter table public.dogs add column if not exists good_with_children boolean default true;

-- 3. Bookings: ensure admin_notes exists (already in main migration but safe)
alter table public.bookings add column if not exists admin_notes text default '';

-- 4. Allow admins to INSERT notifications for any user (needed so a client
--    creating a booking triggers notifications for admins, and admins can
--    notify clients on approve/reject).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Allow authenticated to insert notifications for booking events'
  ) then
    create policy "Allow authenticated to insert notifications for booking events"
      on public.notifications
      for insert
      to authenticated
      with check (true);
  end if;
end $$;

-- 5. Done. Verify columns:
-- select column_name from information_schema.columns where table_schema='public' and table_name='profiles';
-- select column_name from information_schema.columns where table_schema='public' and table_name='dogs';
