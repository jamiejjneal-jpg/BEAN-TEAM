-- ============================================================
-- 20260430_site_services.sql
-- Dynamic service catalogue — lets admins add/edit the walks and
-- services that clients can book (shown on /client/book) and the
-- prices displayed on /pricing. Seeds the existing WALK_TYPES hard-
-- coded list so the app keeps working immediately after this runs.
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.site_services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value         text NOT NULL UNIQUE,    -- slug written into bookings.walk_type
  label         text NOT NULL,
  description   text,
  duration_minutes integer NOT NULL DEFAULT 30,
  price         numeric(8,2) NOT NULL DEFAULT 0,
  price_label   text,                    -- optional override (e.g. "from £15")
  client_bookable boolean NOT NULL DEFAULT true,
  show_on_pricing boolean NOT NULL DEFAULT true,
  category      text,                    -- optional grouping on pricing page
  sort_order    integer NOT NULL DEFAULT 100,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_services_active ON public.site_services(is_active, sort_order);
ALTER TABLE public.site_services ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon on the public pricing page) can read active services
DROP POLICY IF EXISTS "Public read active services" ON public.site_services;
CREATE POLICY "Public read active services"
  ON public.site_services FOR SELECT
  USING (is_active = true);

-- Admins manage everything
DROP POLICY IF EXISTS "Admins manage services" ON public.site_services;
CREATE POLICY "Admins manage services"
  ON public.site_services FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Seed the default WALK_TYPES list (no-ops if rows already exist).
INSERT INTO public.site_services (value, label, description, duration_minutes, price, client_bookable, show_on_pricing, category, sort_order)
VALUES
  ('walk_30',   '30-minute walk',                          'A brisk, energetic walk — perfect for high-energy pups.',                30, 15, true,  true, 'Walks',        10),
  ('walk_60',   '60-minute walk',                          'A full hour of fresh air, sniffs and play.',                              60, 25, true,  true, 'Walks',        20),
  ('walk_90',   '90-minute adventure walk',                'Longer off-lead ramble, ideal for active breeds.',                        90, 35, true,  true, 'Walks',        30),
  ('group_walk','Group walk (up to 3 dogs)',               'Sociable pack walks for confident dogs.',                                 60, 18, true,  true, 'Walks',        40),
  ('solo_walk', 'Solo walk',                               'One-to-one time for shy, reactive or senior dogs.',                       60, 28, true,  true, 'Walks',        50),
  ('puppy_visit','Puppy visit (30 min)',                   'Short garden break, toilet stop and socialisation.',                      30, 12, true,  true, 'Visits',       60),
  ('home_visit','Home visit',                              'A check-in, feed, fresh water and cuddle while you’re out.',              30, 12, true,  true, 'Visits',       70),
  ('overnight', 'Overnight sitting',                       'Evening, overnight and morning care in your home.',                      720, 55, true,  true, 'Sitting',      80),
  ('day_care',  'Daycare (per day)',                       'Full-day care at our home — socialised, safe and active.',               480, 35, true,  true, 'Sitting',      90)
ON CONFLICT (value) DO NOTHING;
