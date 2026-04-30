-- ============================================================
-- Calendar subscription tokens
-- One row per user = one live-updating iCal URL.
-- Token is embedded in a public URL (?token=...) so third-party
-- calendar apps can fetch without sending an auth header.
-- Revocable anytime by the owner.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.calendar_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_tokens_token ON public.calendar_tokens(token);

ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read, create and delete their own token.
-- Service role (Edge Function) bypasses RLS so no SELECT policy is
-- needed for the feed endpoint itself.
DROP POLICY IF EXISTS "Users manage own calendar token" ON public.calendar_tokens;
CREATE POLICY "Users manage own calendar token"
  ON public.calendar_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
