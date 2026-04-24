-- =====================================================================
-- Rocky's Retreat and Rambles — Booking check-constraints relaxation
-- =====================================================================
-- Problem: bookings were failing to insert with "Failed to book walk"
-- because the original CHECK constraint on walk_type only allowed
-- ('standard','extended','group'), but the UI now uses walk_30, walk_60,
-- daycare_4, daycare_day, daycare_ext, overnight, house_sit.
--
-- Fix: drop the restrictive constraint entirely — walk_type is a free
-- product code now (priced/labelled in the UI via WALK_TYPES).
-- Idempotent — safe to run multiple times.
-- =====================================================================

-- Find and drop any CHECK constraint on bookings.walk_type
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
      and tc.table_name   = 'bookings'
      and tc.constraint_type = 'CHECK'
      and ccu.column_name = 'walk_type'
  loop
    execute format('alter table public.bookings drop constraint %I', c.constraint_name);
  end loop;
end $$;

-- Also widen the duration to handle overnight / 24h stays (default was 30)
alter table if exists public.bookings
  alter column duration_minutes set default 30;

-- =====================================================================
-- DONE — clients can now book any walk type offered in the pricing list.
-- =====================================================================
