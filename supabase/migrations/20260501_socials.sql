-- ============================================================
-- 20260501_socials.sql
-- Social media integration foundation.
-- - Adds social handles to people + pets (used for tagging/captions)
-- - Stores admin-configurable caption template + (future) Meta API tokens
-- - Logs every share (manual or automated) for an audit trail
-- Idempotent.
-- ============================================================

-- ---- Social handles on people --------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS social_instagram text,
  ADD COLUMN IF NOT EXISTS social_facebook  text;

-- ---- Social handles on pets ----------------------------------
ALTER TABLE public.dogs
  ADD COLUMN IF NOT EXISTS social_instagram text,
  ADD COLUMN IF NOT EXISTS social_facebook  text;

-- ---- Single-row table holding the business' social config ----
-- We keep ONE row keyed by id='primary'. Tokens live here so an admin
-- can paste them once after Meta App Review approval.
CREATE TABLE IF NOT EXISTS public.site_socials (
  id                         text PRIMARY KEY DEFAULT 'primary',
  enabled                    boolean NOT NULL DEFAULT false,
  caption_template           text DEFAULT E'Today''s adventure with {dog_name}! 🐾\n\n{caption}\n\n{ig_dog}{ig_client} #DogWalker #PetCare #RockysRetreat',
  fb_page_id                 text,
  fb_page_access_token       text,
  ig_business_account_id     text,
  default_hashtags           text DEFAULT '#DogWalker #PetCare #RockysRetreat',
  auto_post                  boolean NOT NULL DEFAULT false,
  walker_can_post            boolean NOT NULL DEFAULT true,
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  updated_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Seed the default row
INSERT INTO public.site_socials (id) VALUES ('primary')
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_socials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage site_socials" ON public.site_socials;
CREATE POLICY "Admins manage site_socials"
  ON public.site_socials FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

-- Walkers need to read non-secret fields to know what they can do; restrict
-- via a view. Easiest: just block walkers from reading tokens at SELECT time
-- by returning a redacted view. For now, only admins read this table.

-- ---- share_log -- every share attempt, manual or automated --
CREATE TABLE IF NOT EXISTS public.share_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_url    text NOT NULL,
  dog_id       uuid REFERENCES public.dogs(id) ON DELETE SET NULL,
  client_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  walker_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  booking_id   uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  channel      text NOT NULL,          -- 'manual' | 'facebook' | 'instagram'
  caption      text,
  status       text NOT NULL DEFAULT 'shared',  -- 'shared' | 'queued' | 'posted' | 'failed'
  external_id  text,                   -- FB/IG post id once posted
  error        text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_log_created ON public.share_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_log_channel ON public.share_log(channel, status);

ALTER TABLE public.share_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage share_log"      ON public.share_log;
DROP POLICY IF EXISTS "Walkers insert share_log"     ON public.share_log;
DROP POLICY IF EXISTS "Walkers read own share_log"   ON public.share_log;

CREATE POLICY "Admins manage share_log"
  ON public.share_log FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Walkers insert share_log"
  ON public.share_log FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Walkers read own share_log"
  ON public.share_log FOR SELECT
  USING (created_by = auth.uid());
