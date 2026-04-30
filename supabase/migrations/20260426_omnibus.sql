-- ============================================================
-- Omnibus enhancement migration
-- Covers: in-app notifications + prefs, cancellation reasons,
-- DBS/insurance, walker unavailability, recurring bookings, NPS.
-- Idempotent — safe to re-run.
-- ============================================================

-- 0) In-app notifications + per-user prefs -------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title              text NOT NULL,
  message            text NOT NULL,
  type               text NOT NULL DEFAULT 'system',
  related_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  is_read            boolean NOT NULL DEFAULT false,
  emailed_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Any authenticated row can insert for another user (system emits these).
DROP POLICY IF EXISTS "Authed insert notifications" ON public.notifications;
CREATE POLICY "Authed insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id            uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  inapp_booking      boolean NOT NULL DEFAULT true,
  inapp_walk_update  boolean NOT NULL DEFAULT true,
  inapp_photo_added  boolean NOT NULL DEFAULT true,
  inapp_review       boolean NOT NULL DEFAULT true,
  inapp_system       boolean NOT NULL DEFAULT true,
  email_booking      boolean NOT NULL DEFAULT true,
  email_walk_update  boolean NOT NULL DEFAULT false,
  email_photo_added  boolean NOT NULL DEFAULT false,
  email_review       boolean NOT NULL DEFAULT false,
  email_system       boolean NOT NULL DEFAULT true,
  digest_mode        text   NOT NULL DEFAULT 'instant' CHECK (digest_mode IN ('instant','daily','weekly')),
  paused_until       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own prefs" ON public.notification_prefs;
CREATE POLICY "Users manage own prefs"
  ON public.notification_prefs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 1) Cancellation reasons -------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- 2) Walker DBS / insurance / bio ------------------------------
ALTER TABLE public.walker_profiles ADD COLUMN IF NOT EXISTS dbs_checked_date date;
ALTER TABLE public.walker_profiles ADD COLUMN IF NOT EXISTS insurance_expires date;
ALTER TABLE public.walker_profiles ADD COLUMN IF NOT EXISTS first_aid_trained boolean DEFAULT false;

-- 3) Walker unavailability (holidays, sick days) ---------------
CREATE TABLE IF NOT EXISTS public.walker_unavailability (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  walker_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_walker_unavailability_walker ON public.walker_unavailability(walker_id, start_date, end_date);

ALTER TABLE public.walker_unavailability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Walkers manage own unavailability" ON public.walker_unavailability;
CREATE POLICY "Walkers manage own unavailability"
  ON public.walker_unavailability FOR ALL
  USING (auth.uid() = walker_id)
  WITH CHECK (auth.uid() = walker_id);

DROP POLICY IF EXISTS "Admins see all unavailability" ON public.walker_unavailability;
CREATE POLICY "Admins see all unavailability"
  ON public.walker_unavailability FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 4) Recurring booking templates -------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dog_id          uuid REFERENCES public.dogs(id) ON DELETE SET NULL,
  walker_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  walk_type       text NOT NULL,
  days_of_week    integer[] NOT NULL,   -- 0=Sun..6=Sat
  scheduled_time  text NOT NULL,         -- 'HH:MM'
  duration_minutes integer NOT NULL DEFAULT 30,
  pickup_address  text,
  notes           text,
  start_date      date NOT NULL,
  end_date        date,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_active ON public.recurring_bookings(is_active, start_date);
ALTER TABLE public.recurring_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients manage own recurring" ON public.recurring_bookings;
CREATE POLICY "Clients manage own recurring"
  ON public.recurring_bookings FOR ALL
  USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "Admins manage all recurring" ON public.recurring_bookings;
CREATE POLICY "Admins manage all recurring"
  ON public.recurring_bookings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 5) NPS / satisfaction surveys --------------------------------
CREATE TABLE IF NOT EXISTS public.nps_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score       integer NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_date ON public.nps_responses(created_at DESC);
ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients submit own NPS" ON public.nps_responses;
CREATE POLICY "Clients submit own NPS"
  ON public.nps_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all NPS" ON public.nps_responses;
CREATE POLICY "Admins read all NPS"
  ON public.nps_responses FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
