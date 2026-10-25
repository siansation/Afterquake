# Aftershock time series with Tiger Data

Aftershocks are a time series: their rate jumps after a big earthquake and then decays roughly as 1/t (Omori's law). Afterquake stores every USGS earthquake it sees in Tiger Data and charts the observed hourly rate against the forecast model's expected rate, in the **Aftershock rate from Tiger Data** card on the **Your spot** tab.

## What is stored

| Object | On Tiger Data (TimescaleDB) | On plain PostgreSQL |
|---|---|---|
| `afterquake.quakes` | Hypertable partitioned by origin time (`at`), 1-day chunks. One row per USGS event; a later USGS revision replaces the earlier row (`ON CONFLICT ... WHERE updated <= EXCLUDED.updated`). | Ordinary table |
| `afterquake.quake_rate_hourly` | Real-time continuous aggregate (`materialized_only = false`): hourly counts per 0.25-degree cell (all, M4+, M5+, max magnitude). A policy refreshes it every 5 minutes; rows newer than the last refresh are still included at query time. | Ordinary view with the same columns |
| Compression | Chunks older than 7 days are compressed (recent ones stay uncompressed because USGS still revises them). | None |
| `afterquake.ingest_meta` | Last pull time per source, used for lazy ingestion | Same |

The chart query reads the continuous aggregate, sums the cells covering the earthquake's aftershock zone, and reports its own query time. It never scans raw events.

## How data arrives

There is no paid cron. `GET /api/quakes?lat=&lon=&radiusKm=&since=&until=` first checks when the USGS feed was last pulled. If that was more than 2 minutes ago, it downloads the [past-day M2.5+ feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson) (6 s timeout) and upserts it. With `backfill=1` (sent for live quakes older than about 18 hours) it also runs one regional USGS FDSN query, at most every 10 minutes per area. A slow or failing USGS never fails the request: the stored series is returned with a note. `GET /api/quakes` with no query is an availability probe: `{configured, timescale}`.

## Set up

1. [Create a Tiger Cloud service](https://www.tigerdata.com/docs/get-started/quickstart/create-service) with TimescaleDB (the default). The same service can hold the check-ins.
2. Put its PostgreSQL URL in `.env.local` as `TIGER_DATABASE_URL` (see `.env.example`; URL-encode special characters in the password; never commit it).
3. `npm install`, then `npm run db:setup`. It prints whether the hypertable, continuous aggregate and policies were created.
4. Backfill (optional but recommended before a demo):
   - `npm run db:ingest` loads the last 30 days of M2.5+ worldwide.
   - `npm run db:ingest -- --event us6000u43g` loads the region and first 60 days around one USGS event.
   - `npm run db:ingest -- --cases` loads the 13 bundled case studies from `data/sequences.json` (no network needed), so the Türkiye story also shows the chart.
   Each import explicitly refreshes its completed hourly buckets on TimescaleDB,
   including older case studies outside the rolling 30-day refresh policy. The
   latest incomplete hour remains available through real-time aggregation.
5. Add `TIGER_DATABASE_URL` to Vercel and redeploy: `npx vercel@65.2.0 env add TIGER_DATABASE_URL production`, then `npx vercel@65.2.0 deploy --prod`.

The card stays hidden when the page is opened from a file, on a static host, when the database is not configured, or when nothing is stored for a case study's area.

## Tested here, and not

`tests/quakes-database.test.js` runs the migration (twice), upserts, revisions, area queries (including across the 180-degree meridian), the case-study backfill and the HTTP route against real PostgreSQL (PGlite). `tests/quakes-api.test.js` covers validation, lazy ingestion, USGS timeouts and failures, regional backfill throttling, rate limits and private errors with a mocked store. PGlite has no TimescaleDB, so `create_hypertable`, the continuous aggregate and the refresh and compression policies only run on a real Tiger Data service: check the `npm run db:setup` output there.

`tests/ingest-refresh.test.js` checks historical refresh windows, including separate
case-study date ranges and the live-hour cutoff. `tests/qr.test.js` rasterises and
independently decodes the generated QR SVG, checking its invite payload and white
border. These automated checks do not replace scanning it with a physical phone.
