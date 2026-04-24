-- =====================================================
-- PawTrail - Storage RLS for dog-photos bucket
-- Paste into Supabase SQL Editor (idempotent)
-- =====================================================

-- 1. Ensure bucket is public-read (safe to re-run)
update storage.buckets set public = true where id = 'dog-photos';

-- 2. Allow any authenticated user to UPLOAD to the bucket
-- (we want admins, clients, and walkers to all be able to upload)
drop policy if exists "authenticated can upload to dog-photos" on storage.objects;
create policy "authenticated can upload to dog-photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dog-photos');

-- 3. Allow any authenticated user to UPDATE / OVERWRITE
drop policy if exists "authenticated can update dog-photos" on storage.objects;
create policy "authenticated can update dog-photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'dog-photos')
  with check (bucket_id = 'dog-photos');

-- 4. Allow any authenticated user to DELETE
drop policy if exists "authenticated can delete dog-photos" on storage.objects;
create policy "authenticated can delete dog-photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dog-photos');

-- 5. Public read (anonymous + authenticated)
drop policy if exists "public can read dog-photos" on storage.objects;
create policy "public can read dog-photos"
  on storage.objects for select to public
  using (bucket_id = 'dog-photos');
