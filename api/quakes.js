// Aftershock rate from Tiger Data. GET with no query: availability probe.
// GET ?lat&lon&radiusKm&since&until: hourly counts for that area from the continuous
// aggregate. Ingestion is lazy (no paid cron needed): if the last pull of the USGS
// feed is older than STALE_MS, the request first pulls and upserts it. A slow or
// failing USGS never fails the request; the stored series is returned regardless.
const { getPool } = require('../server/checkins-store');
const { createStore, rowFromFeature } = require('../server/quakes-store');
const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const FDSN = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const STALE_MS = 2 * 60 * 1000, BACKFILL_MS = 10 * 60 * 1000, TIMEOUT_MS = 6000;
const hits = new Map();
function limited(key, now = Date.now()) {
  const times = (hits.get(key) || []).filter(t => now - t < 60000);
  times.push(now); hits.set(key, times);
  if (hits.size > 5000) hits.clear();
  return times.length > 60;
}
async function fetchJSON(url, fetchImpl, timeoutMs) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('USGS ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}
function parseQuery(query = {}) {
  const lat = Number(query.lat), lon = Number(query.lon), radiusKm = Number(query.radiusKm ?? 150);
  const since = Date.parse(query.since), until = query.until ? Date.parse(query.until) : Date.now() + 3600e3;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) return { error: 'Choose a valid location.' };
  if (!Number.isFinite(radiusKm) || radiusKm < 10 || radiusKm > 600) return { error: 'Use a radius between 10 and 600 km.' };
  if (!Number.isFinite(since) || !Number.isFinite(until) || until <= since) return { error: 'Use a valid since/until time window.' };
  if (until - since > 400 * 864e5) return { error: 'Use a time window of at most 400 days.' };
  return { lat, lon, radiusKm, since: new Date(since).toISOString(), until: new Date(until).toISOString() };
}
function createHandler({ store, configured = () => !!process.env.TIGER_DATABASE_URL, throttle = limited,
  fetchImpl = (...a) => fetch(...a), now = () => Date.now(), timeoutMs = TIMEOUT_MS } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Use GET.' }); }
    const query = req.query || {};
    if (!Object.keys(query).length) {
      if (!configured()) return res.status(200).json({ configured: false, provider: 'Tiger Data' });
      try { const db = store || createStore(getPool()); return res.status(200).json({ configured: true, provider: 'Tiger Data', timescale: await db.timescale() }); }
      catch { return res.status(200).json({ configured: true, provider: 'Tiger Data', timescale: null, error: 'Database unreachable.' }); }
    }
    if (!configured()) return res.status(503).json({ error: 'The aftershock time series is not set up on this server yet.' });
    const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (throttle(ip)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Too many requests. Try again in a minute.' }); }
    const params = parseQuery(query);
    if (params.error) return res.status(400).json({ error: params.error });
    try {
      const db = store || createStore(getPool());
      const ingest = { attempted: false, rows: 0, error: null };
      // 1. Lazy pull of the last day of USGS events.
      const last = await db.lastIngest('feed');
      if (!last || now() - Date.parse(last) > STALE_MS) {
        ingest.attempted = true;
        try {
          const feed = await fetchJSON(FEED, fetchImpl, timeoutMs);
          const rows = (feed.features || []).map(rowFromFeature).filter(Boolean);
          ingest.rows += await db.upsert(rows);
          await db.markIngest('feed', rows.length);
        } catch { ingest.error = 'USGS feed unavailable; showing stored data.'; }
      }
      // 2. Optional one-off regional backfill for an older quake, at most every 10 minutes per area.
      if (query.backfill === '1') {
        const key = `region:${params.lat.toFixed(1)},${params.lon.toFixed(1)}:${params.since.slice(0, 13)}`;
        const done = await db.lastIngest(key);
        if (!done || now() - Date.parse(done) > BACKFILL_MS) {
          ingest.attempted = true;
          try {
            const url = `${FDSN}?` + new URLSearchParams({ format: 'geojson', starttime: params.since, endtime: params.until,
              latitude: String(params.lat), longitude: String(params.lon), maxradiuskm: String(params.radiusKm), minmagnitude: '2.5', limit: '5000' });
            const data = await fetchJSON(url, fetchImpl, timeoutMs);
            const rows = (data.features || []).map(rowFromFeature).filter(Boolean);
            ingest.rows += await db.upsert(rows);
            await db.markIngest(key, rows.length);
          } catch { ingest.error = 'USGS catalogue unavailable; showing stored data.'; }
        }
      }
      const t0 = performance.now();
      const buckets = await db.buckets(params);
      const queryMs = Math.round((performance.now() - t0) * 10) / 10;
      return res.status(200).json({ configured: true, provider: 'Tiger Data', timescale: await db.timescale(), buckets,
        totalStored: await db.totalStored(), lastIngest: await db.lastIngest('feed'), queryMs, ingest });
    } catch {
      // Never echo database errors: they can contain hostnames and credentials.
      return res.status(503).json({ error: 'The aftershock time series is temporarily unavailable.' });
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.parseQuery = parseQuery;
