-- Run once with npm run db:setup. Re-running this migration preserves entries.
BEGIN;
CREATE SCHEMA IF NOT EXISTS afterquake;
CREATE TABLE IF NOT EXISTS afterquake.checkins (
  room_hash text NOT NULL CHECK (room_hash ~ '^[a-f0-9]{64}$'),
  sequence text NOT NULL CHECK (sequence ~ '^(live:)?[A-Za-z0-9_-]{1,80}$'),
  owner_hash text NOT NULL CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
  public_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('safe', 'help')),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 80),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (room_hash, sequence, owner_hash)
);
CREATE INDEX IF NOT EXISTS checkins_expiry ON afterquake.checkins (expires_at);
CREATE TABLE IF NOT EXISTS afterquake.checkin_events (
  at timestamptz NOT NULL DEFAULT now(),
  room_hash text NOT NULL CHECK (room_hash ~ '^[a-f0-9]{64}$'),
  sequence text NOT NULL,
  owner_hash text NOT NULL CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('safe', 'help'))
);
-- Tiger services with TimescaleDB use a real hypertable for the status timeline.
-- Plain PostgreSQL also works for local integration tests and small deployments.
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('afterquake.checkin_events', by_range('at', INTERVAL '1 day'), if_not_exists => true, migrate_data => true);
  END IF;
END
$migration$;
CREATE INDEX IF NOT EXISTS checkin_events_scope ON afterquake.checkin_events (room_hash, sequence, at DESC);
CREATE INDEX IF NOT EXISTS checkin_events_owner ON afterquake.checkin_events (room_hash, sequence, owner_hash);
COMMIT;
