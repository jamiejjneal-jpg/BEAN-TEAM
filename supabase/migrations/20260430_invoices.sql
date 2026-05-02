-- ============================================================
-- 20260430_invoices.sql
-- Invoicing: admin creates manual invoices or auto-generates one per
-- client from their completed walks for a chosen month. Each invoice
-- has line-items pulled from bookings + service pricing. Admin marks
-- paid manually. Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no    text NOT NULL UNIQUE,
  client_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  issue_date    date NOT NULL DEFAULT CURRENT_DATE,
  due_date      date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  period_start  date,
  period_end    date,
  subtotal      numeric(10,2) NOT NULL DEFAULT 0,
  tax_rate      numeric(5,2)  NOT NULL DEFAULT 0,
  tax_amount    numeric(10,2) NOT NULL DEFAULT 0,
  total         numeric(10,2) NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','sent','paid','overdue','void')),
  notes         text,
  sent_at       timestamptz,
  paid_at       timestamptz,
  paid_method   text,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_client  ON public.invoices(client_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status  ON public.invoices(status, due_date);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  booking_id    uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  description   text NOT NULL,
  qty           integer NOT NULL DEFAULT 1,
  unit_price    numeric(10,2) NOT NULL DEFAULT 0,
  line_total    numeric(10,2) NOT NULL DEFAULT 0,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_booking ON public.invoice_items(booking_id);

ALTER TABLE public.invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Admins manage everything
DROP POLICY IF EXISTS "Admins manage invoices"      ON public.invoices;
CREATE POLICY "Admins manage invoices"
  ON public.invoices FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins manage invoice_items" ON public.invoice_items;
CREATE POLICY "Admins manage invoice_items"
  ON public.invoice_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Clients read their OWN invoices
DROP POLICY IF EXISTS "Clients read own invoices" ON public.invoices;
CREATE POLICY "Clients read own invoices"
  ON public.invoices FOR SELECT
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Clients read own invoice_items" ON public.invoice_items;
CREATE POLICY "Clients read own invoice_items"
  ON public.invoice_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND i.client_id = auth.uid()));

-- Helper: next invoice number based on current count (simple monotonic).
-- Consumed by the client when no invoice_no is supplied.
CREATE OR REPLACE FUNCTION public.next_invoice_no() RETURNS text
  LANGUAGE plpgsql AS $$
DECLARE
  seq_num integer;
BEGIN
  SELECT COUNT(*) + 1 INTO seq_num FROM public.invoices;
  RETURN 'INV-' || to_char(now(), 'YYYY') || '-' || LPAD(seq_num::text, 4, '0');
END $$;
