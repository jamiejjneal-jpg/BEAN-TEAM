-- ============================================================
-- 20260430_recurring_link.sql
-- Links bookings rows to their recurring template (if any) so the UI can
-- count future occurrences and clean them up when a template is paused or
-- deleted. Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS recurring_template_id uuid
  REFERENCES public.recurring_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_recurring_template
  ON public.bookings(recurring_template_id)
  WHERE recurring_template_id IS NOT NULL;
