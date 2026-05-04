-- ============================================================
-- 20260501_fix_invoices_rls_and_sequence.sql
-- Fixes two bugs:
--   1. Invoice RLS silently blocks SELECT because it uses the old
--      "SELECT FROM profiles" subquery that hits infinite recursion.
--      Switch to public.is_admin() helper (SECURITY DEFINER).
--   2. Invoice number sequencing uses COUNT(*)+1 which duplicates when
--      an invoice is deleted and is race-prone. Use a real Postgres
--      sequence for guaranteed monotonic, unique numbers.
-- Idempotent. Safe to run multiple times.
-- ============================================================

-- --- 1. Invoices RLS using is_admin() ------------------------
DROP POLICY IF EXISTS "Admins manage invoices"        ON public.invoices;
DROP POLICY IF EXISTS "Clients read own invoices"     ON public.invoices;

CREATE POLICY "Admins manage invoices"
  ON public.invoices FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Clients read own invoices"
  ON public.invoices FOR SELECT
  USING (client_id = auth.uid());

-- --- 2. Invoice items RLS using is_admin() -------------------
DROP POLICY IF EXISTS "Admins manage invoice_items"     ON public.invoice_items;
DROP POLICY IF EXISTS "Clients read own invoice_items"  ON public.invoice_items;

CREATE POLICY "Admins manage invoice_items"
  ON public.invoice_items FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Clients read own invoice_items"
  ON public.invoice_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND i.client_id = auth.uid()
  ));

-- --- 3. Monotonic invoice number using a real sequence -------
CREATE SEQUENCE IF NOT EXISTS public.invoice_no_seq START WITH 1;

-- If the DB already has invoices, seed the sequence past the highest
-- existing numeric suffix so we never clash with historical numbers.
DO $$
DECLARE
  max_num integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_no, '^INV-\d{4}-', ''), '')::integer), 0)
    INTO max_num
  FROM public.invoices;
  IF max_num > 0 THEN
    PERFORM setval('public.invoice_no_seq', max_num, true);
  END IF;
EXCEPTION WHEN others THEN
  -- If invoice_no has non-numeric suffixes, just skip seeding
  NULL;
END $$;

CREATE OR REPLACE FUNCTION public.next_invoice_no() RETURNS text
  LANGUAGE plpgsql AS $$
DECLARE
  seq_num integer;
BEGIN
  seq_num := nextval('public.invoice_no_seq');
  RETURN 'INV-' || to_char(now(), 'YYYY') || '-' || LPAD(seq_num::text, 4, '0');
END $$;

GRANT USAGE ON SEQUENCE public.invoice_no_seq TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_no() TO authenticated;
