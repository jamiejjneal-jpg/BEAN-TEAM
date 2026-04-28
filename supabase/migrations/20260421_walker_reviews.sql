-- ============================================================
-- Walker reviews & ratings — clients leave a review after a
-- completed booking. Shown on walker profiles + admin overview.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.walker_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  walker_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  is_public   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, client_id)   -- one review per booking per client
);

CREATE INDEX IF NOT EXISTS idx_walker_reviews_walker  ON public.walker_reviews(walker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_walker_reviews_client  ON public.walker_reviews(client_id);
CREATE INDEX IF NOT EXISTS idx_walker_reviews_booking ON public.walker_reviews(booking_id);

ALTER TABLE public.walker_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read public reviews (so walker profiles look good)
CREATE POLICY "Anyone can read public reviews"
  ON public.walker_reviews FOR SELECT
  USING (is_public = true OR auth.uid() = client_id OR auth.uid() = walker_id
         OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Clients can create one review per booking they own
CREATE POLICY "Clients create own reviews"
  ON public.walker_reviews FOR INSERT
  WITH CHECK (auth.uid() = client_id);

-- Clients can edit/delete their own
CREATE POLICY "Clients update own reviews"
  ON public.walker_reviews FOR UPDATE
  USING (auth.uid() = client_id);

CREATE POLICY "Clients delete own reviews"
  ON public.walker_reviews FOR DELETE
  USING (auth.uid() = client_id);

-- Admins full control
CREATE POLICY "Admins manage all reviews"
  ON public.walker_reviews FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Auto-recompute walker average rating on insert/update/delete
CREATE OR REPLACE FUNCTION public.refresh_walker_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target uuid := COALESCE(NEW.walker_id, OLD.walker_id);
  v_avg  numeric;
  v_cnt  integer;
BEGIN
  SELECT AVG(rating)::numeric(3,2), COUNT(*)
    INTO v_avg, v_cnt
    FROM public.walker_reviews
   WHERE walker_id = target;
  UPDATE public.walker_profiles
     SET rating = COALESCE(v_avg, 0),
         total_reviews = v_cnt
   WHERE user_id = target;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_walker_rating_refresh ON public.walker_reviews;
CREATE TRIGGER trg_walker_rating_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.walker_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_walker_rating();
