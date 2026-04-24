-- =====================================================================
-- Rocky's Retreat and Rambles — Foreign-Key ON DELETE migration
-- =====================================================================
-- Purpose: allow Admin to delete a user (walker / client / admin) without
-- PostgreSQL blocking the operation with `violates foreign key constraint`
-- (SQLSTATE 23503).
--
-- Policy (confirmed with owner):
--   • Historical bookings are preserved → null out client_id / walker_id
--     (we keep the row so reports, audit trail, photos and walk logs stay
--     intact).
--   • A deleted client's dogs are removed too (CASCADE).
--   • Walk logs, reviews, notifications referencing the deleted user are
--     nulled out so the records survive.
--   • Helper/joining tables (walker_profiles, walker_payouts) cascade because
--     they have no meaning without their owner.
--
-- Safe to run multiple times — every block uses "drop constraint if exists"
-- followed by "add constraint".
-- =====================================================================

-- ---------- bookings ----------
alter table if exists public.bookings
  drop constraint if exists bookings_client_id_fkey;
alter table if exists public.bookings
  add  constraint bookings_client_id_fkey
  foreign key (client_id) references public.profiles(id) on delete set null;

alter table if exists public.bookings
  drop constraint if exists bookings_walker_id_fkey;
alter table if exists public.bookings
  add  constraint bookings_walker_id_fkey
  foreign key (walker_id) references public.profiles(id) on delete set null;

-- dogs will be cascade-deleted with the client, so bookings.dog_id must
-- become nullable on dog deletion too (otherwise the dog-delete itself
-- is blocked by bookings).
alter table if exists public.bookings
  drop constraint if exists bookings_dog_id_fkey;
alter table if exists public.bookings
  add  constraint bookings_dog_id_fkey
  foreign key (dog_id) references public.dogs(id) on delete set null;

-- make the columns nullable (they may have been NOT NULL originally)
alter table if exists public.bookings alter column client_id drop not null;
alter table if exists public.bookings alter column walker_id drop not null;
alter table if exists public.bookings alter column dog_id   drop not null;

-- ---------- walk_logs ----------
alter table if exists public.walk_logs
  drop constraint if exists walk_logs_walker_id_fkey;
alter table if exists public.walk_logs
  add  constraint walk_logs_walker_id_fkey
  foreign key (walker_id) references public.profiles(id) on delete set null;

alter table if exists public.walk_logs alter column walker_id drop not null;

-- ---------- reviews ----------
alter table if exists public.reviews
  drop constraint if exists reviews_client_id_fkey;
alter table if exists public.reviews
  add  constraint reviews_client_id_fkey
  foreign key (client_id) references public.profiles(id) on delete set null;

alter table if exists public.reviews
  drop constraint if exists reviews_walker_id_fkey;
alter table if exists public.reviews
  add  constraint reviews_walker_id_fkey
  foreign key (walker_id) references public.profiles(id) on delete set null;

alter table if exists public.reviews alter column client_id drop not null;
alter table if exists public.reviews alter column walker_id drop not null;

-- ---------- notifications ----------
-- notifications.user_id is already ON DELETE CASCADE (notifications vanish
-- with the user). Nothing to change there.

-- ---------- walker_payouts ----------
-- walker_id already CASCADES. paid_by (admin) should null out.
alter table if exists public.walker_payouts
  drop constraint if exists walker_payouts_paid_by_fkey;
alter table if exists public.walker_payouts
  add  constraint walker_payouts_paid_by_fkey
  foreign key (paid_by) references public.profiles(id) on delete set null;

-- ---------- gallery_comments (if present) ----------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='gallery_comments') then
    execute 'alter table public.gallery_comments
             drop constraint if exists gallery_comments_author_id_fkey';
    execute 'alter table public.gallery_comments
             add  constraint gallery_comments_author_id_fkey
             foreign key (author_id) references public.profiles(id) on delete set null';
    execute 'alter table public.gallery_comments alter column author_id drop not null';
  end if;
end $$;

-- ---------- site_images.updated_by  &  audit_log.actor_id ----------
-- Both already reference auth.users(id) with ON DELETE SET NULL. Nothing
-- to change, but re-assert anyway so this migration is self-contained.
alter table if exists public.site_images
  drop constraint if exists site_images_updated_by_fkey;
alter table if exists public.site_images
  add  constraint site_images_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

alter table if exists public.audit_log
  drop constraint if exists audit_log_actor_id_fkey;
alter table if exists public.audit_log
  add  constraint audit_log_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete set null;

-- =====================================================================
-- DONE
-- After running, Admin → Delete User will succeed; bookings and walk logs
-- linked to deleted users will show "Deleted user" / "Unassigned" in the UI.
-- =====================================================================
