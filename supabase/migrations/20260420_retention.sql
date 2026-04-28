-- ============================================================
-- Retention policies — auto-purge old rows weekly via pg_cron.
-- Prevents unbounded growth of audit_log and login_history.
-- ============================================================

-- 1) Function: purge audit_log rows older than 12 months
CREATE OR REPLACE FUNCTION public.purge_old_audit_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '12 months';
END;
$$;

-- 2) Function: purge login_history rows older than 90 days
CREATE OR REPLACE FUNCTION public.purge_old_login_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.login_history
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- 3) Schedule with pg_cron — every Sunday 04:00 UK time (03:00 UTC winter)
DO $$ BEGIN
  PERFORM cron.unschedule('weekly-audit-purge');
EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule(
  'weekly-audit-purge',
  '0 3 * * 0',
  $$ SELECT public.purge_old_audit_log(); $$
);

DO $$ BEGIN
  PERFORM cron.unschedule('weekly-login-history-purge');
EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule(
  'weekly-login-history-purge',
  '5 3 * * 0',
  $$ SELECT public.purge_old_login_history(); $$
);

-- 4) Confirm
SELECT jobname, schedule FROM cron.job
 WHERE jobname IN ('weekly-audit-purge','weekly-login-history-purge');
