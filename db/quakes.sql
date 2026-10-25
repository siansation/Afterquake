-- Aftershocks are a time series. Run with npm run db:setup (safe to re-run; keeps rows).
-- On a Tiger Data service (TimescaleDB): a hypertable partitioned by day, a real-time
-- continuous aggregate of hourly counts per 0.25-degree cell, a refresh policy and
-- compression for older chunks. On plain PostgreSQL (local tests) the same names exist
-- as an ordinary table and view, so the API code is identical.
BEGIN;
CREATE SCHEMA IF NOT EXISTS afterquake;
CREATE TABLE IF NOT EXISTS afterquake.quakes (
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9:_.-]{1,80}$'),
  at timestamptz NOT NULL,
  mag real NOT NULL CHECK (mag BETWEEN -2 AND 10),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
  depth real,
  place text NOT NULL DEFAULT '' CHECK (length(place) <= 200),
  updated timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, at)
);
CREATE INDEX IF NOT EXISTS quakes_cell_time ON afterquake.quakes ((floor(lat * 4)), (floor(lon * 4)), at DESC);
CREATE TABLE IF NOT EXISTS afterquake.ingest_meta (
  key text PRIMARY KEY CHECK (length(key) <= 120),
  at timestamptz NOT NULL DEFAULT now(),
  rows integer NOT NULL DEFAULT 0
);
COMMIT;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('afterquake.quakes', by_range('at', INTERVAL '1 day'), if_not_exists => true, migrate_data => true);
    -- Real-time aggregate: materialised hours plus not-yet-materialised recent rows.
    IF NOT EXISTS (SELECT 1 FROM timescaledb_information.continuous_aggregates
                   WHERE view_schema = 'afterquake' AND view_name = 'quake_rate_hourly') THEN
      EXECUTE $cagg$
        CREATE MATERIALIZED VIEW afterquake.quake_rate_hourly
        WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
        SELECT time_bucket(INTERVAL '1 hour', at) AS hour,
               floor(lat * 4)::int AS cell_lat, floor(lon * 4)::int AS cell_lon,
               count(*)::int AS n,
               count(*) FILTER (WHERE mag >= 4)::int AS n4,
               count(*) FILTER (WHERE mag >= 5)::int AS n5,
               max(mag) AS max_mag
        FROM afterquake.quakes
        GROUP BY 1, 2, 3
        WITH NO DATA
      $cagg$;
    END IF;
    PERFORM add_continuous_aggregate_policy('afterquake.quake_rate_hourly',
      start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '5 minutes', if_not_exists => true);
    -- USGS revises recent events, so compress only chunks older than a week.
    EXECUTE 'ALTER TABLE afterquake.quakes SET (timescaledb.compress, timescaledb.compress_orderby = ''at DESC'')';
    PERFORM add_compression_policy('afterquake.quakes', INTERVAL '7 days', if_not_exists => true);
  ELSE
    -- Plain PostgreSQL fallback with the same columns.
    EXECUTE $view$
      CREATE OR REPLACE VIEW afterquake.quake_rate_hourly AS
      SELECT date_trunc('hour', at, 'UTC') AS hour,
             floor(lat * 4)::int AS cell_lat, floor(lon * 4)::int AS cell_lon,
             count(*)::int AS n,
             count(*) FILTER (WHERE mag >= 4)::int AS n4,
             count(*) FILTER (WHERE mag >= 5)::int AS n5,
             max(mag) AS max_mag
      FROM afterquake.quakes
      GROUP BY 1, 2, 3
    $view$;
  END IF;
END
$migration$;
