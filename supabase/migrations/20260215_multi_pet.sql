-- ============================================================
-- Rocky's Retreat & Rambles — Multi-Pet Migration
-- Adds support for Cats, Rabbits, Birds, Fish, Reptiles,
-- and Small Mammals alongside existing Dogs.
--
-- SAFE: Keeps all existing table names / FKs / RLS intact.
-- Only adds columns + new enums + relaxes a CHECK constraint.
-- ============================================================

-- 1) Pet species enum
DO $$ BEGIN
  CREATE TYPE pet_species AS ENUM (
    'dog','cat','rabbit','bird','fish','reptile','small_mammal'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Booking service-type enum (walks for dogs, visits for other pets)
DO $$ BEGIN
  CREATE TYPE service_type AS ENUM ('walk','visit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Extend the existing `dogs` table to hold all pet types
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS species pet_species NOT NULL DEFAULT 'dog';
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS details  JSONB        NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_dogs_species ON dogs(species);

-- 4) Extend bookings so visit-type services can be booked later
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_type service_type NOT NULL DEFAULT 'walk';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS visit_type   text;

CREATE INDEX IF NOT EXISTS idx_bookings_service_type ON bookings(service_type);

-- 5) Allow additional event types in walk_logs for non-dog care
--    NOT VALID = apply only to new rows; legacy rows are grandfathered.
ALTER TABLE walk_logs DROP CONSTRAINT IF EXISTS walk_logs_event_type_check;
ALTER TABLE walk_logs ADD CONSTRAINT walk_logs_event_type_check
  CHECK (event_type IN (
    'start','end','photo','update',
    'feeding','medication','tank_check',
    'cage_clean','litter_change','playtime'
  ))
  NOT VALID;

-- 6) Sanity: backfill existing rows (they're all dogs already but be explicit)
UPDATE dogs     SET species      = 'dog'  WHERE species IS NULL;
UPDATE bookings SET service_type = 'walk' WHERE service_type IS NULL;
