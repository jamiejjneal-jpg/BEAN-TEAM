-- ============================================================
-- 20260501_birthdays_and_promos.sql
-- - dogs.date_of_birth for birthday banners + emails
-- - promo_codes (admin-managed) + booking columns to track redemption
-- Idempotent.
-- ============================================================

-- ---- Dog date of birth ---------------------------------------
ALTER TABLE public.dogs
  ADD COLUMN IF NOT EXISTS date_of_birth date;

-- ---- promo_codes ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  description   text,
  discount_type text NOT NULL,        -- 'percent' | 'fixed'
  amount        numeric(10,2) NOT NULL,
  valid_from    date,
  valid_until   date,
  max_uses      integer,              -- NULL = unlimited
  used_count    integer NOT NULL DEFAULT 0,
  applies_to    text,                 -- comma-separated walk_type slugs; NULL = all
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_codes DROP CONSTRAINT IF EXISTS promo_codes_type_chk;
ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_type_chk CHECK (discount_type IN ('percent','fixed'));

CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON public.promo_codes(code) WHERE is_active = true;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage promo_codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Anyone reads active promos" ON public.promo_codes;

CREATE POLICY "Admins manage promo_codes"
  ON public.promo_codes FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

-- Anyone signed in can SELECT active promos so the booking form can validate
-- codes without needing admin role.
CREATE POLICY "Anyone reads active promos"
  ON public.promo_codes FOR SELECT
  USING (is_active = true);

-- ---- Booking columns to track applied promo ------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS promo_code        text,
  ADD COLUMN IF NOT EXISTS discount_amount   numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_price    numeric(10,2),
  ADD COLUMN IF NOT EXISTS final_price       numeric(10,2);

-- ---- RPC: atomic promo validate + increment ------------------
-- Used when applying a code at booking time. Returns the discount calc
-- or raises a sane error.
CREATE OR REPLACE FUNCTION public.apply_promo_code(
  p_code     text,
  p_amount   numeric,
  p_walk_type text
) RETURNS TABLE (
  promo_id        uuid,
  discount_type   text,
  amount          numeric,
  discount_value  numeric,
  final_price     numeric,
  description     text
)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  p   public.promo_codes;
  today date := (now() AT TIME ZONE 'UTC')::date;
  disc numeric;
  fin  numeric;
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RAISE EXCEPTION 'no_code';
  END IF;

  SELECT * INTO p FROM public.promo_codes
   WHERE upper(code) = upper(trim(p_code))
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT p.is_active THEN RAISE EXCEPTION 'inactive'; END IF;
  IF p.valid_from IS NOT NULL AND today < p.valid_from THEN RAISE EXCEPTION 'not_yet_valid'; END IF;
  IF p.valid_until IS NOT NULL AND today > p.valid_until THEN RAISE EXCEPTION 'expired'; END IF;
  IF p.max_uses IS NOT NULL AND p.used_count >= p.max_uses THEN RAISE EXCEPTION 'fully_used'; END IF;

  IF p.applies_to IS NOT NULL AND p.applies_to <> '' AND p_walk_type IS NOT NULL THEN
    IF NOT (string_to_array(p.applies_to, ',') @> ARRAY[p_walk_type]) THEN
      RAISE EXCEPTION 'wrong_service';
    END IF;
  END IF;

  IF p.discount_type = 'percent' THEN
    disc := round(p_amount * (p.amount / 100.0), 2);
  ELSE
    disc := LEAST(p.amount, p_amount);
  END IF;
  fin := GREATEST(0, p_amount - disc);

  RETURN QUERY SELECT p.id, p.discount_type, p.amount, disc, fin, p.description;
END $$;

GRANT EXECUTE ON FUNCTION public.apply_promo_code(text, numeric, text) TO authenticated;

-- ---- RPC: increment usage on successful booking --------------
CREATE OR REPLACE FUNCTION public.increment_promo_use(p_code text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.promo_codes
    SET used_count = used_count + 1, updated_at = now()
    WHERE upper(code) = upper(trim(p_code));
END $$;

GRANT EXECUTE ON FUNCTION public.increment_promo_use(text) TO authenticated;
