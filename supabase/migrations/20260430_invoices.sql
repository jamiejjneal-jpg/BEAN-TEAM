-- ============================================================
-- 20260430_invoices.sql  (revised — safe against a pre-existing
-- `invoices` table with a different schema)
-- Adds every column with IF NOT EXISTS so both fresh and legacy DBs work.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_no   text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_id    uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issue_date   date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date     date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days');
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period_start date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period_end   date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subtotal     numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_rate     numeric(5,2)  NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_amount   numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total        numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'draft';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes        text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sent_at      timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_at      timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_method  text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_at   timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now();

-- Unique invoice_no
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_no_key') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_no_key UNIQUE (invoice_no);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Status check
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_chk;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_chk
  CHECK (status IN ('draft','sent','paid','overdue','void'));

CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices(client_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status, due_date);

-- Items
CREATE TABLE IF NOT EXISTS public.invoice_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS invoice_id  uuid REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS booking_id  uuid REFERENCES public.bookings(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS qty         integer NOT NULL DEFAULT 1;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS unit_price  numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS line_total  numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS sort_order  integer NOT NULL DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_booking ON public.invoice_items(booking_id);

ALTER TABLE public.invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices"
  ON public.invoices FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins manage invoice_items" ON public.invoice_items;
CREATE POLICY "Admins manage invoice_items"
  ON public.invoice_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Clients read own invoices" ON public.invoices;
CREATE POLICY "Clients read own invoices"
  ON public.invoices FOR SELECT
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Clients read own invoice_items" ON public.invoice_items;
CREATE POLICY "Clients read own invoice_items"
  ON public.invoice_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND i.client_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.next_invoice_no() RETURNS text
  LANGUAGE plpgsql AS $$
DECLARE
  seq_num integer;
BEGIN
  SELECT COUNT(*) + 1 INTO seq_num FROM public.invoices;
  RETURN 'INV-' || to_char(now(), 'YYYY') || '-' || LPAD(seq_num::text, 4, '0');
END $$;
