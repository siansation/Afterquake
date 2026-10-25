// Backfill the aftershock time series in Tiger Data. Prints counts only, never the URL.
//   npm run db:ingest                  last 30 days of M2.5+ worldwide (USGS 2.5_month feed)
//   npm run db:ingest -- --event ID    the region and period around one USGS event (FDSN query)
//   npm run db:ingest -- --cases       the 13 bundled case studies, from data/sequences.json (no network)
const fs = require('node:fs');
const path = require('node:path');
const { poolConfig } = require('../server/checkins-store');
const { createStore, rowFromFeature } = require('../server/quakes-store');
const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson';
const FDSN = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

// Case-study rows from the bundled catalogue: [days since mainshock, mag, lat, lon].
function caseRows(data) {
  const rows = [];
  for (const s of data.sequences) {
    const t0 = Date.parse(s.t0);
    s.events.forEach(([days, mag, lat, lon], i) => {
      const at = new Date(t0 + days * 864e5).toISOString();
      rows.push({ id: `case:${s.key}:${i}`, at, mag, lat, lon, depth: null, place: s.label.slice(0, 200), updated: at });
    });
  }
  return rows;
}
async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error('USGS returned ' + res.status);
  return res.json();
}
async function main() {
  const envFile = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  if (!process.env.TIGER_DATABASE_URL) throw new Error('Set TIGER_DATABASE_URL in .env.local first.');
  const args = process.argv.slice(2), { Pool } = require('pg'), pool = new Pool(poolConfig()), store = createStore(pool);
  try {
    let rows, key;
    if (args.includes('--cases')) {
      rows = caseRows(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sequences.json'), 'utf8'))); key = 'cases';
    } else if (args.includes('--event')) {
      const id = args[args.indexOf('--event') + 1];
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id || '')) throw new Error('Give a USGS event ID, e.g. --event us6000jllz');
      const ev = await getJSON(`${FDSN}?format=geojson&eventid=${id}`), [lon, lat] = ev.geometry.coordinates, t0 = ev.properties.time, M = ev.properties.mag;
      const radiusKm = Math.round(Math.pow(10, -2.44 + 0.59 * M) * 1.2 + 30);
      const data = await getJSON(`${FDSN}?` + new URLSearchParams({ format: 'geojson', starttime: new Date(t0 - 864e5).toISOString(),
        endtime: new Date(Math.min(t0 + 60 * 864e5, Date.now())).toISOString(), latitude: lat, longitude: lon, maxradiuskm: radiusKm, minmagnitude: '2.5', limit: '20000' }));
      rows = data.features.map(rowFromFeature).filter(Boolean); key = 'event:' + id;
    } else {
      rows = (await getJSON(FEED)).features.map(rowFromFeature).filter(Boolean); key = 'month';
    }
    const written = await store.upsert(rows);
    await store.markIngest(key, rows.length);
    if (key === 'month') await store.markIngest('feed', rows.length);
    console.log(`Stored ${written} of ${rows.length} quakes (${key}). Total in Tiger Data: ${await store.totalStored()}.`);
  } finally { await pool.end(); }
}
if (require.main === module) main().catch(e => {
  console.error('Ingest failed: ' + (/USGS|event ID|TIGER_DATABASE_URL/.test(e.message) ? e.message : 'check the Tiger Data URL, TLS certificate and network. No credentials were printed.'));
  process.exitCode = 1;
});
module.exports = { caseRows };
