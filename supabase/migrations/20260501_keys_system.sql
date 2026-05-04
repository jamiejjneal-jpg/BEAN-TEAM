-- ============================================================
-- 20260501_keys_system.sql
-- QR key tagging + audit system.
-- - keys:        one per physical key. Linked to a client. Has a secure
--                random token used as the QR URL.
-- - key_events:  immutable audit log. Every create/pickup/dropoff/view
--                is appended here. Cannot be updated or deleted.
-- Idempotent. Safe to re-run.
-- ============================================================

-- ---- keys --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.keys (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  label             text NOT NULL DEFAULT 'Front door',
  qr_token          text NOT NULL UNIQUE,
  status            text NOT NULL DEFAULT 'active',
  current_holder_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  current_holder_role text,
  last_event_at     timestamptz,
  notes             text,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.keys DROP CONSTRAINT IF EXISTS keys_status_chk;
ALTER TABLE public.keys
  ADD CONSTRAINT keys_status_chk CHECK (status IN ('active','lost','retired'));

CREATE INDEX IF NOT EXISTS idx_keys_client ON public.keys(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keys_holder ON public.keys(current_holder_id);

-- ---- key_events --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.key_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id      uuid NOT NULL REFERENCES public.keys(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role  text,
  actor_name  text,
  note        text,
  geo_lat     double precision,
  geo_lng     double precision,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.key_events DROP CONSTRAINT IF EXISTS key_events_type_chk;
ALTER TABLE public.key_events
  ADD CONSTRAINT key_events_type_chk
  CHECK (event_type IN ('created','viewed','pickup','dropoff','lost','retired','reactivated','relabelled'));

CREATE INDEX IF NOT EXISTS idx_key_events_key  ON public.key_events(key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_key_events_actor ON public.key_events(actor_id, created_at DESC);

-- ---- RLS ---------------------------------------------------------------
ALTER TABLE public.keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_events  ENABLE ROW LEVEL SECURITY;

-- Keys: admins manage everything; clients can SELECT their own; walkers
-- can SELECT keys they currently hold.
DROP POLICY IF EXISTS "Admins manage keys"          ON public.keys;
DROP POLICY IF EXISTS "Clients read own keys"       ON public.keys;
DROP POLICY IF EXISTS "Walkers read keys they hold" ON public.keys;

CREATE POLICY "Admins manage keys"
  ON public.keys FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Clients read own keys"
  ON public.keys FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "Walkers read keys they hold"
  ON public.keys FOR SELECT
  USING (current_holder_id = auth.uid());

-- Key events: admins see/write everything; clients see events for their
-- own keys; walkers can INSERT their own pickup/dropoff events on any key
-- (admin reviews); walkers see events for keys they hold or held.
DROP POLICY IF EXISTS "Admins manage key_events"          ON public.key_events;
DROP POLICY IF EXISTS "Clients read events on own keys"   ON public.key_events;
DROP POLICY IF EXISTS "Walkers insert own key events"     ON public.key_events;
DROP POLICY IF EXISTS "Walkers read events on held keys"  ON public.key_events;

CREATE POLICY "Admins manage key_events"
  ON public.key_events FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Clients read events on own keys"
  ON public.key_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.keys k
    WHERE k.id = key_events.key_id AND k.client_id = auth.uid()
  ));

CREATE POLICY "Walkers insert own key events"
  ON public.key_events FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND event_type IN ('pickup','dropoff','viewed')
  );

CREATE POLICY "Walkers read events on held keys"
  ON public.key_events FOR SELECT
  USING (actor_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.keys k
    WHERE k.id = key_events.key_id
      AND (k.current_holder_id = auth.uid())
  ));

-- Key events are immutable — no UPDATE or DELETE for anyone except admins
-- (who can retire a key; the row itself is never amended).

-- ---- Helper: atomically record a pickup/dropoff event + sync key --------
-- Client calls this RPC so the keys row and audit log stay consistent.
CREATE OR REPLACE FUNCTION public.record_key_event(
  p_key_id     uuid,
  p_event_type text,
  p_note       text DEFAULT NULL,
  p_geo_lat    double precision DEFAULT NULL,
  p_geo_lng    double precision DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS public.key_events
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  me       uuid := auth.uid();
  my_role  text;
  my_name  text;
  my_email text;
  k        public.keys;
  ev       public.key_events;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT role, full_name, email INTO my_role, my_name, my_email
    FROM public.profiles WHERE id = me;

  IF my_role IS NULL THEN
    RAISE EXCEPTION 'no_profile';
  END IF;

  IF p_event_type NOT IN ('pickup','dropoff','viewed','lost','retired','reactivated','relabelled') THEN
    RAISE EXCEPTION 'invalid_event_type';
  END IF;

  SELECT * INTO k FROM public.keys WHERE id = p_key_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'key_not_found';
  END IF;

  -- Only admin/walker can pickup/dropoff. Clients can only view.
  IF p_event_type IN ('pickup','dropoff') AND my_role NOT IN ('admin','walker') THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  -- Only admins can lost/retired/reactivated/relabelled
  IF p_event_type IN ('lost','retired','reactivated','relabelled') AND my_role <> 'admin' THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  INSERT INTO public.key_events
    (key_id, event_type, actor_id, actor_role, actor_name, note, geo_lat, geo_lng, user_agent)
  VALUES
    (p_key_id, p_event_type, me, my_role, COALESCE(my_name, my_email, me::text), p_note, p_geo_lat, p_geo_lng, p_user_agent)
  RETURNING * INTO ev;

  IF p_event_type = 'pickup' THEN
    UPDATE public.keys
      SET current_holder_id = me,
          current_holder_role = my_role,
          last_event_at = now(),
          updated_at = now()
      WHERE id = p_key_id;
  ELSIF p_event_type = 'dropoff' THEN
    UPDATE public.keys
      SET current_holder_id = NULL,
          current_holder_role = NULL,
          last_event_at = now(),
          updated_at = now()
      WHERE id = p_key_id;
  ELSIF p_event_type = 'lost' THEN
    UPDATE public.keys SET status='lost', last_event_at=now(), updated_at=now() WHERE id=p_key_id;
  ELSIF p_event_type = 'retired' THEN
    UPDATE public.keys SET status='retired', last_event_at=now(), updated_at=now() WHERE id=p_key_id;
  ELSIF p_event_type = 'reactivated' THEN
    UPDATE public.keys SET status='active', last_event_at=now(), updated_at=now() WHERE id=p_key_id;
  END IF;

  RETURN ev;
END $$;

GRANT EXECUTE ON FUNCTION public.record_key_event(uuid, text, text, double precision, double precision, text) TO authenticated;

-- ---- Public lookup by token (read-only, returns minimal info) ----------
-- Used by the scan page for unauthenticated users so they can see the
-- "please return" contact card without being logged in.
CREATE OR REPLACE FUNCTION public.lookup_key_by_token(p_token text)
  RETURNS TABLE (
    key_id       uuid,
    label        text,
    status       text,
    client_name  text,
    client_phone text,
    business_name text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.label,
    k.status,
    p.full_name,
    p.phone,
    (SELECT value FROM public.site_texts WHERE key='brand_name' LIMIT 1)
  FROM public.keys k
  JOIN public.profiles p ON p.id = k.client_id
  WHERE k.qr_token = p_token
  LIMIT 1;
END $$;

GRANT EXECUTE ON FUNCTION public.lookup_key_by_token(text) TO anon, authenticated;
