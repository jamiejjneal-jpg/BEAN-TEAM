-- =====================================================================
-- Rocky's Retreat and Rambles — Admin can insert bookings for anyone
-- =====================================================================
-- Problem: the existing "Clients can create bookings" policy only permits
-- inserts where auth.uid() = client_id. Admins inserting a booking on
-- behalf of a client therefore get:
--   "new row violates row-level security policy for table bookings"
--
-- Fix: extend the INSERT policy so admins may insert bookings with any
-- client_id. Clients remain restricted to booking for themselves.
--
-- Safe to run multiple times.
-- =====================================================================

drop policy if exists "Clients can create bookings"        on public.bookings;
drop policy if exists "Clients and admins can create bookings" on public.bookings;

create policy "Clients and admins can create bookings" on public.bookings
  for insert to authenticated
  with check (
    -- Clients may only create a booking for themselves.
    auth.uid() = client_id
    -- Admins may create a booking for anyone.
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- =====================================================================
-- DONE — admin Add Booking flow will now succeed.
-- =====================================================================
