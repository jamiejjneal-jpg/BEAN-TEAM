-- ============================================================
-- 20260430_site_texts.sql
-- Editable text blocks used across the public + marketing pages so
-- admin can tweak copy without a redeploy. Writes from the new
-- /admin/site-setup page; reads are public (anon-safe) so the
-- landing/pricing pages can render without auth.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.site_texts (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.site_texts ENABLE ROW LEVEL SECURITY;

-- Anyone can read (public marketing copy)
DROP POLICY IF EXISTS "Anyone read texts" ON public.site_texts;
CREATE POLICY "Anyone read texts"
  ON public.site_texts FOR SELECT USING (true);

-- Admins manage everything
DROP POLICY IF EXISTS "Admins write texts" ON public.site_texts;
CREATE POLICY "Admins write texts"
  ON public.site_texts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
