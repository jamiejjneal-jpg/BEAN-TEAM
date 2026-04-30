-- ============================================================
-- 20260430_time_off_approval.sql
-- Time-off approval workflow for walker_unavailability
--   • adds status (pending/approved/rejected)
--   • adds recurrence (weekly / block-N-weeks / one-off)
--   • adds admin approval metadata
--   • admin-created rows are auto-approved by RLS default
--   • walker-created rows default to 'pending' and need admin approval
--   • walkers can only delete their own PENDING rows; admin manages all
-- Idempotent — safe to re-run.
-- ============================================================

-- Allow end_date to be NULL (ongoing time off)
ALTER TABLE public.walker_unavailability ALTER COLUMN end_date DROP NOT NULL;

-- Drop the old CHECK constraint (it required end_date >= start_date — now
-- end_date can be NULL). We'll re-add a NULL-safe version.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.walker_unavailability'::regclass
             AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%end_date >= start_date%') THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.walker_unavailability DROP CONSTRAINT ' || conname
      FROM pg_constraint WHERE conrelid = 'public.walker_unavailability'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%end_date >= start_date%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.walker_unavailability
  ADD CONSTRAINT walker_unavailability_dates_chk
  CHECK (end_date IS NULL OR end_date >= start_date);

-- New columns
ALTER TABLE public.walker_unavailability ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.walker_unavailability ADD COLUMN IF NOT EXISTS recurrence_type text;
ALTER TABLE public.walker_unavailability ADD COLUMN IF NOT EXISTS recurrence_weekday integer;
ALTER TABLE public.walker_unavailability ADD COLUMN IF NOT EXISTS recurrence_block_weeks integer;
ALTER TABLE public.walker_unavailability ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.walker_unavailability ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.walker_unavailability ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.walker_unavailability ADD COLUMN IF NOT EXISTS admin_note text;

-- CHECK constraints (dropped-then-added to stay idempotent)
ALTER TABLE public.walker_unavailability DROP CONSTRAINT IF EXISTS walker_unavailability_status_chk;
ALTER TABLE public.walker_unavailability ADD CONSTRAINT walker_unavailability_status_chk
  CHECK (status IN ('pending','approved','rejected'));

ALTER TABLE public.walker_unavailability DROP CONSTRAINT IF EXISTS walker_unavailability_recurrence_chk;
ALTER TABLE public.walker_unavailability ADD CONSTRAINT walker_unavailability_recurrence_chk
  CHECK (recurrence_type IS NULL OR recurrence_type IN ('weekly','block'));

ALTER TABLE public.walker_unavailability DROP CONSTRAINT IF EXISTS walker_unavailability_weekday_chk;
ALTER TABLE public.walker_unavailability ADD CONSTRAINT walker_unavailability_weekday_chk
  CHECK (recurrence_weekday IS NULL OR recurrence_weekday BETWEEN 0 AND 6);

-- Backfill: any existing rows created before this migration are grandfathered-in
-- as approved (owner created them, they were already being honoured).
UPDATE public.walker_unavailability SET status = 'approved'
  WHERE status = 'pending' AND approved_at IS NULL AND requested_by IS NULL;

-- RLS: clean up old walker policy, replace with approval-aware rules
DROP POLICY IF EXISTS "Walkers manage own unavailability" ON public.walker_unavailability;
DROP POLICY IF EXISTS "Walkers view own unavailability" ON public.walker_unavailability;
DROP POLICY IF EXISTS "Walkers insert own pending" ON public.walker_unavailability;
DROP POLICY IF EXISTS "Walkers delete own pending" ON public.walker_unavailability;

-- Walker can see their own rows (any status)
CREATE POLICY "Walkers view own unavailability"
  ON public.walker_unavailability FOR SELECT
  USING (auth.uid() = walker_id);

-- Walker can insert rows only for themselves, and status MUST be pending.
CREATE POLICY "Walkers insert own pending"
  ON public.walker_unavailability FOR INSERT
  WITH CHECK (auth.uid() = walker_id AND status = 'pending');

-- Walker can delete their own rows only while pending (can't retract an approved leave)
CREATE POLICY "Walkers delete own pending"
  ON public.walker_unavailability FOR DELETE
  USING (auth.uid() = walker_id AND status = 'pending');

-- Admins already have full SELECT via "Admins see all unavailability".
-- Add admin INSERT/UPDATE/DELETE covering approvals + self-creation.
DROP POLICY IF EXISTS "Admins manage all unavailability" ON public.walker_unavailability;
CREATE POLICY "Admins manage all unavailability"
  ON public.walker_unavailability FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Helpful index for pending queue
CREATE INDEX IF NOT EXISTS idx_walker_unavailability_status ON public.walker_unavailability(status, created_at DESC);
