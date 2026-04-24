-- =====================================================================
-- Rocky's Retreat and Rambles — Widen walk_logs.event_type
-- =====================================================================
-- Problem: walk_logs had a CHECK constraint restricting event_type to
-- ('started','arrived','picked_up','dropped_off','completed','note'). The
-- admin gallery upload flow inserts event_type='photo' for stand-alone
-- photo posts, which triggered:
--   "new row for relation walk_logs violates check constraint
--    walk_logs_event_type_check"
--
-- Fix: drop the rigid CHECK (we now have lots of product events:
-- 'photo', key drop-off, vet visit, etc.) — event_type is a free-form code
-- validated in application code.
--
-- Safe to run multiple times.
-- =====================================================================

do $$
declare
  c record;
begin
  for c in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name
     and tc.table_schema   = ccu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name   = 'walk_logs'
      and tc.constraint_type = 'CHECK'
      and ccu.column_name = 'event_type'
  loop
    execute format('alter table public.walk_logs drop constraint %I', c.constraint_name);
  end loop;
end $$;

-- =====================================================================
-- DONE — photo uploads (event_type='photo') and all future event types
-- will now save cleanly.
-- =====================================================================
