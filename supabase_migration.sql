-- =====================================================
-- PawTrail Dog Walking Business System
-- Complete SQL Setup - Run in Supabase SQL Editor
-- IMPORTANT: Run this as a single script
-- =====================================================

-- Drop old triggers first (before dropping tables)
drop trigger if exists on_auth_user_created on auth.users;

-- Drop existing tables (from previous version) to start fresh
-- CASCADE will automatically remove any triggers/policies on these tables
drop table if exists public.notifications cascade;
drop table if exists public.reviews cascade;
drop table if exists public.walk_logs cascade;
drop table if exists public.bookings cascade;
drop table if exists public.walker_schedule cascade;
drop table if exists public.walker_profiles cascade;
drop table if exists public.dogs cascade;
drop table if exists public.profiles cascade;

-- =====================================================
-- 1. CREATE TABLES
-- =====================================================

create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  role text not null default 'client' check (role in ('admin', 'walker', 'client')),
  phone text default '',
  address text default '',
  avatar_url text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.dogs (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  breed text default '',
  age integer,
  weight decimal,
  size text check (size in ('small', 'medium', 'large', 'extra_large')),
  special_notes text default '',
  medical_info text default '',
  photo_url text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.walker_profiles (
  id uuid references public.profiles(id) on delete cascade primary key,
  bio text default '',
  experience_years integer default 0,
  hourly_rate decimal default 15.00,
  max_dogs integer default 3,
  service_area text default '',
  is_available boolean default true,
  rating decimal default 0,
  total_reviews integer default 0,
  total_walks integer default 0,
  certifications text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.walker_schedule (
  id uuid default gen_random_uuid() primary key,
  walker_id uuid references public.profiles(id) on delete cascade not null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean default true,
  created_at timestamptz default now()
);

create table public.bookings (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.profiles(id) not null,
  walker_id uuid references public.profiles(id),
  dog_id uuid references public.dogs(id) not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  scheduled_date date not null,
  scheduled_time time not null,
  duration_minutes integer not null default 30,
  walk_type text default 'standard' check (walk_type in ('standard', 'extended', 'group')),
  notes text default '',
  pickup_address text default '',
  dropoff_address text default '',
  admin_notes text default '',
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.walk_logs (
  id uuid default gen_random_uuid() primary key,
  booking_id uuid references public.bookings(id) on delete cascade not null,
  walker_id uuid references public.profiles(id) not null,
  event_type text not null check (event_type in ('started', 'arrived', 'picked_up', 'dropped_off', 'completed', 'note')),
  notes text default '',
  photo_url text,
  created_at timestamptz default now()
);

create table public.reviews (
  id uuid default gen_random_uuid() primary key,
  booking_id uuid references public.bookings(id) on delete cascade not null,
  client_id uuid references public.profiles(id) not null,
  walker_id uuid references public.profiles(id) not null,
  rating integer not null check (rating between 1 and 5),
  comment text default '',
  created_at timestamptz default now()
);

create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  message text not null,
  type text default 'info' check (type in ('info', 'booking', 'walk_update', 'review', 'system')),
  is_read boolean default false,
  related_booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz default now()
);

-- =====================================================
-- 2. INDEXES
-- =====================================================

create index idx_dogs_owner on public.dogs(owner_id);
create index idx_bookings_client on public.bookings(client_id);
create index idx_bookings_walker on public.bookings(walker_id);
create index idx_bookings_status on public.bookings(status);
create index idx_bookings_date on public.bookings(scheduled_date);
create index idx_walk_logs_booking on public.walk_logs(booking_id);
create index idx_notifications_user on public.notifications(user_id);
create index idx_notifications_unread on public.notifications(user_id, is_read);
create index idx_reviews_walker on public.reviews(walker_id);
create index idx_walker_schedule_walker on public.walker_schedule(walker_id);

-- =====================================================
-- 3. AUTO-CREATE PROFILE ON USER SIGNUP
-- =====================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );

  if coalesce(new.raw_user_meta_data->>'role', 'client') = 'walker' then
    insert into public.walker_profiles (id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================
-- 4. AUTO-UPDATE TIMESTAMPS
-- =====================================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at();
create trigger update_dogs_updated_at before update on public.dogs for each row execute function public.update_updated_at();
create trigger update_walker_profiles_updated_at before update on public.walker_profiles for each row execute function public.update_updated_at();
create trigger update_bookings_updated_at before update on public.bookings for each row execute function public.update_updated_at();

-- =====================================================
-- 5. NOTIFICATION TRIGGER (Walk Events -> Client Notification)
-- =====================================================

create or replace function public.handle_walk_event()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_booking record;
  v_walker_name text;
  v_dog_name text;
  v_notification_title text;
  v_notification_message text;
begin
  select b.*, p.full_name as client_name
  into v_booking
  from public.bookings b
  join public.profiles p on p.id = b.client_id
  where b.id = new.booking_id;

  select full_name into v_walker_name
  from public.profiles where id = new.walker_id;

  select name into v_dog_name
  from public.dogs where id = v_booking.dog_id;

  case new.event_type
    when 'arrived' then
      v_notification_title := 'Walker Arrived!';
      v_notification_message := v_walker_name || ' has arrived to pick up ' || coalesce(v_dog_name, 'your dog') || '.';
    when 'picked_up' then
      v_notification_title := 'Walk Started!';
      v_notification_message := v_walker_name || ' has picked up ' || coalesce(v_dog_name, 'your dog') || ' and the walk has begun.';
    when 'dropped_off' then
      v_notification_title := 'Dog Returned Safely!';
      v_notification_message := v_walker_name || ' has safely returned ' || coalesce(v_dog_name, 'your dog') || '. Walk completed!';
    when 'completed' then
      v_notification_title := 'Walk Completed!';
      v_notification_message := 'The walk with ' || coalesce(v_dog_name, 'your dog') || ' by ' || v_walker_name || ' is now complete. Please leave a review!';
    else
      v_notification_title := 'Walk Update';
      v_notification_message := 'Update from ' || v_walker_name || ' regarding your walk.';
  end case;

  insert into public.notifications (user_id, title, message, type, related_booking_id)
  values (v_booking.client_id, v_notification_title, v_notification_message, 'walk_update', new.booking_id);

  return new;
end;
$$;

create trigger on_walk_event
  after insert on public.walk_logs
  for each row execute function public.handle_walk_event();

-- =====================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- =====================================================

alter table public.profiles enable row level security;
alter table public.dogs enable row level security;
alter table public.walker_profiles enable row level security;
alter table public.walker_schedule enable row level security;
alter table public.bookings enable row level security;
alter table public.walk_logs enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;

create policy "Profiles viewable by authenticated" on public.profiles for select to authenticated using (true);
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Service role full access profiles" on public.profiles for all to service_role using (true);

create policy "Dogs viewable by authenticated" on public.dogs for select to authenticated using (true);
create policy "Clients can insert own dogs" on public.dogs for insert to authenticated with check (auth.uid() = owner_id);
create policy "Clients can update own dogs" on public.dogs for update to authenticated using (auth.uid() = owner_id);
create policy "Clients can delete own dogs" on public.dogs for delete to authenticated using (auth.uid() = owner_id);
create policy "Service role full access dogs" on public.dogs for all to service_role using (true);

create policy "Walker profiles viewable by authenticated" on public.walker_profiles for select to authenticated using (true);
create policy "Walkers can update own profile" on public.walker_profiles for update to authenticated using (auth.uid() = id);
create policy "Walkers can insert own profile" on public.walker_profiles for insert to authenticated with check (auth.uid() = id);
create policy "Service role full access walker_profiles" on public.walker_profiles for all to service_role using (true);

create policy "Schedule viewable by authenticated" on public.walker_schedule for select to authenticated using (true);
create policy "Walkers can insert own schedule" on public.walker_schedule for insert to authenticated with check (auth.uid() = walker_id);
create policy "Walkers can update own schedule" on public.walker_schedule for update to authenticated using (auth.uid() = walker_id);
create policy "Walkers can delete own schedule" on public.walker_schedule for delete to authenticated using (auth.uid() = walker_id);
create policy "Service role full access walker_schedule" on public.walker_schedule for all to service_role using (true);

create policy "Users can view relevant bookings" on public.bookings for select to authenticated using (
  auth.uid() = client_id or
  auth.uid() = walker_id or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Clients can create bookings" on public.bookings for insert to authenticated with check (auth.uid() = client_id);
create policy "Relevant users can update bookings" on public.bookings for update to authenticated using (
  auth.uid() = client_id or
  auth.uid() = walker_id or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Service role full access bookings" on public.bookings for all to service_role using (true);

create policy "Walk logs viewable by relevant users" on public.walk_logs for select to authenticated using (
  auth.uid() = walker_id or
  exists (select 1 from public.bookings where id = booking_id and client_id = auth.uid()) or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Walkers can insert walk logs" on public.walk_logs for insert to authenticated with check (auth.uid() = walker_id);
create policy "Service role full access walk_logs" on public.walk_logs for all to service_role using (true);

create policy "Reviews viewable by authenticated" on public.reviews for select to authenticated using (true);
create policy "Clients can insert reviews" on public.reviews for insert to authenticated with check (auth.uid() = client_id);
create policy "Service role full access reviews" on public.reviews for all to service_role using (true);

create policy "Users can view own notifications" on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "Users can update own notifications" on public.notifications for update to authenticated using (auth.uid() = user_id);
create policy "Service role full access notifications" on public.notifications for all to service_role using (true);

-- =====================================================
-- 7. AUTO-UPDATE WALKER RATING ON NEW REVIEW
-- =====================================================

create or replace function public.update_walker_rating()
returns trigger
language plpgsql
as $$
begin
  update public.walker_profiles
  set
    rating = (select coalesce(avg(rating), 0) from public.reviews where walker_id = new.walker_id),
    total_reviews = (select count(*) from public.reviews where walker_id = new.walker_id)
  where id = new.walker_id;
  return new;
end;
$$;

create trigger update_walker_rating_on_review
  after insert or update on public.reviews
  for each row execute function public.update_walker_rating();

-- =====================================================
-- 8. UPDATE WALKER TOTAL WALKS ON BOOKING COMPLETION
-- =====================================================

create or replace function public.update_walker_total_walks()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and (old.status is null or old.status != 'completed') then
    update public.walker_profiles
    set total_walks = total_walks + 1
    where id = new.walker_id;
  end if;
  return new;
end;
$$;

create trigger update_walker_walks_on_booking
  after update on public.bookings
  for each row execute function public.update_walker_total_walks();

-- =====================================================
-- 9. ENABLE REALTIME for live notifications
-- =====================================================

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.walk_logs;
