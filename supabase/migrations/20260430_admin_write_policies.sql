-- ============================================================
-- 20260430_admin_write_policies.sql
-- Critical bug fix: admins couldn't save edits to clients' pet/client
-- profile cards because RLS only allowed the owner. Updates silently
-- did 0 rows instead of erroring. This migration adds explicit admin
-- UPDATE/DELETE policies on the affected tables.
-- Idempotent — safe to re-run.
-- ============================================================

-- dogs (pets)
DROP POLICY IF EXISTS "Admins can manage all dogs" ON public.dogs;
CREATE POLICY "Admins can manage all dogs"
  ON public.dogs FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- profiles (used for admin-edited client cards)
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- walker_profiles (used for admin-edited walker cards)
DROP POLICY IF EXISTS "Admins can manage all walker_profiles" ON public.walker_profiles;
CREATE POLICY "Admins can manage all walker_profiles"
  ON public.walker_profiles FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Also make sure the `key_code` / `key_location` columns exist (the
-- frontend writes these — the original migration used `keycode` /
-- `access_notes`, which is a mismatch). Add matching columns and
-- optionally backfill from the legacy names.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS key_code text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS key_location text DEFAULT '';

UPDATE public.profiles
  SET key_code = COALESCE(NULLIF(key_code, ''), keycode)
  WHERE (key_code IS NULL OR key_code = '') AND keycode IS NOT NULL AND keycode <> '';
UPDATE public.profiles
  SET key_location = COALESCE(NULLIF(key_location, ''), access_notes)
  WHERE (key_location IS NULL OR key_location = '') AND access_notes IS NOT NULL AND access_notes <> '';
