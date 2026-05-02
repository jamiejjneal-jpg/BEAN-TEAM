-- ============================================================
-- 20260430_fix_admin_rls_recursion.sql
-- CRITICAL FIX: The admin policies I wrote earlier cause infinite
-- recursion on the `profiles` table, because they check role by
-- querying `profiles` from inside a policy on `profiles`.
--
-- Replacement pattern: SECURITY DEFINER function `public.is_admin()`
-- which runs with owner privileges and therefore bypasses RLS when
-- it reads `profiles`. All the admin policies switch to calling this.
--
-- Idempotent — safe to re-run. Apply AFTER 20260430_admin_write_policies.sql.
-- ============================================================

-- 1) A tiny, cached, RLS-bypassing check.
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Allow authenticated callers to invoke it
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 2) Rewrite the recursive policies to use is_admin() instead of a
--    nested SELECT on profiles.

-- profiles: admins can do anything; everyone else can still see/edit their own row.
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- dogs
DROP POLICY IF EXISTS "Admins can manage all dogs" ON public.dogs;
CREATE POLICY "Admins can manage all dogs"
  ON public.dogs FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- walker_profiles
DROP POLICY IF EXISTS "Admins can manage all walker_profiles" ON public.walker_profiles;
CREATE POLICY "Admins can manage all walker_profiles"
  ON public.walker_profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Also update the other admin policies from this session that used the
-- same recursive pattern. All these tables don't self-query, so they
-- technically worked — but is_admin() is cleaner and faster.

DROP POLICY IF EXISTS "Admins manage services" ON public.site_services;
CREATE POLICY "Admins manage services"
  ON public.site_services FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins write texts" ON public.site_texts;
CREATE POLICY "Admins write texts"
  ON public.site_texts FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices"
  ON public.invoices FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage invoice_items" ON public.invoice_items;
CREATE POLICY "Admins manage invoice_items"
  ON public.invoice_items FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage all unavailability" ON public.walker_unavailability;
CREATE POLICY "Admins manage all unavailability"
  ON public.walker_unavailability FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins see all unavailability" ON public.walker_unavailability;
CREATE POLICY "Admins see all unavailability"
  ON public.walker_unavailability FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage all recurring" ON public.recurring_bookings;
CREATE POLICY "Admins manage all recurring"
  ON public.recurring_bookings FOR ALL
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read all NPS" ON public.nps_responses;
CREATE POLICY "Admins read all NPS"
  ON public.nps_responses FOR SELECT
  USING (public.is_admin());
