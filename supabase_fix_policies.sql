-- =====================================================
-- PawTrail - RLS Policies Fix
-- Run this in Supabase SQL Editor
-- =====================================================

-- PROFILES
create policy "Profiles viewable by authenticated" on public.profiles for select to authenticated using (true);
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Service role full access profiles" on public.profiles for all to service_role using (true);

-- DOGS
create policy "Dogs viewable by authenticated" on public.dogs for select to authenticated using (true);
create policy "Clients can insert own dogs" on public.dogs for insert to authenticated with check (auth.uid() = owner_id);
create policy "Clients can update own dogs" on public.dogs for update to authenticated using (auth.uid() = owner_id);
create policy "Clients can delete own dogs" on public.dogs for delete to authenticated using (auth.uid() = owner_id);
create policy "Service role full access dogs" on public.dogs for all to service_role using (true);

-- WALKER PROFILES
create policy "Walker profiles viewable" on public.walker_profiles for select to authenticated using (true);
create policy "Walkers can update own" on public.walker_profiles for update to authenticated using (auth.uid() = id);
create policy "Walkers can insert own" on public.walker_profiles for insert to authenticated with check (auth.uid() = id);
create policy "Service role walker_profiles" on public.walker_profiles for all to service_role using (true);

-- WALKER SCHEDULE
create policy "Schedule viewable" on public.walker_schedule for select to authenticated using (true);
create policy "Walkers insert schedule" on public.walker_schedule for insert to authenticated with check (auth.uid() = walker_id);
create policy "Walkers update schedule" on public.walker_schedule for update to authenticated using (auth.uid() = walker_id);
create policy "Walkers delete schedule" on public.walker_schedule for delete to authenticated using (auth.uid() = walker_id);
create policy "Service role walker_schedule" on public.walker_schedule for all to service_role using (true);

-- BOOKINGS
create policy "View relevant bookings" on public.bookings for select to authenticated using (
  auth.uid() = client_id or auth.uid() = walker_id or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Clients create bookings" on public.bookings for insert to authenticated with check (auth.uid() = client_id);
create policy "Update relevant bookings" on public.bookings for update to authenticated using (
  auth.uid() = client_id or auth.uid() = walker_id or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Service role bookings" on public.bookings for all to service_role using (true);

-- WALK LOGS
create policy "View walk logs" on public.walk_logs for select to authenticated using (
  auth.uid() = walker_id or
  exists (select 1 from public.bookings where id = booking_id and client_id = auth.uid()) or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Walkers insert logs" on public.walk_logs for insert to authenticated with check (auth.uid() = walker_id);
create policy "Service role walk_logs" on public.walk_logs for all to service_role using (true);

-- REVIEWS
create policy "Reviews viewable" on public.reviews for select to authenticated using (true);
create policy "Clients insert reviews" on public.reviews for insert to authenticated with check (auth.uid() = client_id);
create policy "Service role reviews" on public.reviews for all to service_role using (true);

-- NOTIFICATIONS
create policy "View own notifications" on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "Update own notifications" on public.notifications for update to authenticated using (auth.uid() = user_id);
create policy "Service role notifications" on public.notifications for all to service_role using (true);
