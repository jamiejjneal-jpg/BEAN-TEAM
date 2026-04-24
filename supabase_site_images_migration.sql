-- =====================================================================
-- Site Images migration — admin-managed photos for public pages
-- Safe to re-run (idempotent).
-- =====================================================================

-- 1) Table: maps a known slot key to an image URL
create table if not exists public.site_images (
  key          text primary key,
  url          text not null,
  alt          text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);

-- 2) RLS — public can read; only admins may insert/update/delete
alter table public.site_images enable row level security;

drop policy if exists site_images_public_read on public.site_images;
create policy site_images_public_read
  on public.site_images for select
  using (true);

drop policy if exists site_images_admin_write on public.site_images;
create policy site_images_admin_write
  on public.site_images for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 3) Storage bucket for site imagery (public-readable)
insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do update set public = true;

-- 4) Storage policies — public read, admin write
drop policy if exists "Public can read site-images" on storage.objects;
create policy "Public can read site-images"
  on storage.objects for select
  using (bucket_id = 'site-images');

drop policy if exists "Admins can upload site-images" on storage.objects;
create policy "Admins can upload site-images"
  on storage.objects for insert
  with check (
    bucket_id = 'site-images'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "Admins can update site-images" on storage.objects;
create policy "Admins can update site-images"
  on storage.objects for update
  using (
    bucket_id = 'site-images'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "Admins can delete site-images" on storage.objects;
create policy "Admins can delete site-images"
  on storage.objects for delete
  using (
    bucket_id = 'site-images'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
