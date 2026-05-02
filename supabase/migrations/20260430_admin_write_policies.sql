-- ============================================================
-- 20260430_admin_write_policies.sql  (revised — safe for fresh DBs)
-- Critical bug fix: admins couldn't save edits to clients' pet/client
-- profile cards because RLS only allowed the owner. Updates silently
-- did 0 rows instead of erroring. This migration adds explicit admin
-- ALL-access policies on the affected tables and guarantees the
-- key_code / key_location columns exist (legacy names backfilled only
-- if those columns actually exist).
-- Idempotent — safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage all dogs" ON public.dogs;
CREATE POLICY "Admins can manage all dogs"
  ON public.dogs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can manage all walker_profiles" ON public.walker_profiles;
CREATE POLICY "Admins can manage all walker_profiles"
  ON public.walker_profiles FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS key_code text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS key_location text DEFAULT '';

-- Only backfill from legacy columns if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='keycode') THEN
    EXECUTE $sql$
      UPDATE public.profiles SET key_code = COALESCE(NULLIF(key_code, ''), keycode)
      WHERE (key_code IS NULL OR key_code = '') AND keycode IS NOT NULL AND keycode <> ''
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='access_notes') THEN
    EXECUTE $sql$
      UPDATE public.profiles SET key_location = COALESCE(NULLIF(key_location, ''), access_notes)
      WHERE (key_location IS NULL OR key_location = '') AND access_notes IS NOT NULL AND access_notes <> ''
    $sql$;
  END IF;
END $$;
