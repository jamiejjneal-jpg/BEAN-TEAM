-- =====================================================================
-- Audit log migration — who changed what, when
-- Safe to re-run.
-- =====================================================================

create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_name   text,
  actor_email  text,
  action       text not null,
  target_type  text,
  target_id    text,
  target_name  text,
  details      jsonb
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_action_idx     on public.audit_log (action);
create index if not exists audit_log_actor_idx      on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

-- Admins can read everything
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Admins can insert audit rows from the browser (browser-initiated events)
drop policy if exists audit_log_admin_insert on public.audit_log;
create policy audit_log_admin_insert on public.audit_log for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- No updates, no deletes from the UI — audit trail is append-only
drop policy if exists audit_log_no_update on public.audit_log;
create policy audit_log_no_update on public.audit_log for update using (false) with check (false);

drop policy if exists audit_log_no_delete on public.audit_log;
create policy audit_log_no_delete on public.audit_log for delete using (false);
