// Read-only verification of the bundled mainshocks and regional M5+ counts.
// Uses public USGS endpoints, with no API key. Does not refresh or overwrite data.
import fs from 'node:fs';
const D = JSON.parse(fs.readFileSync(new URL('../data/sequences.json', import.meta.url), 'utf8'));
const API = 'https://earthquake.usgs.gov/fdsnws/event/1/';
async function request(endpoint, params) {
  const response = await fetch(API + endpoint + '?' + new URLSearchParams(params), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`USGS ${endpoint}: HTTP ${response.status}`);
  return response;
}
const results = [];
// Limit concurrent requests; a source failure must not silently count as a pass.
for (let i = 0; i < D.sequences.length; i += 3) {
  results.push(...await Promise.all(D.sequences.slice(i, i + 3).map(async s => {
    try {
      const event = await (await request('query', { format: 'geojson', eventid: s.id })).json();
      const t0 = Date.parse(s.t0);
      const remoteCount = Number(await (await request('count', {
        starttime: new Date(t0 - 2 * 864e5).toISOString(),
        endtime: new Date(t0 + s.daysAvailable * 864e5).toISOString(),
        latitude: s.lat, longitude: s.lon, maxradiuskm: s.radiusKm, minmagnitude: 5
      })).text());
      const localCount = s.events.filter(e => e[1] >= 5 && e[0] >= -2 && e[0] <= s.daysAvailable).length;
      const mainshockMatches = event.properties.mag === s.M && event.properties.time === t0 &&
        Math.abs(event.geometry.coordinates[0] - s.lon) < 1e-8 && Math.abs(event.geometry.coordinates[1] - s.lat) < 1e-8;
      return { sequence: s.key, mainshockMatches, localM5: localCount, usgsM5: remoteCount,
        pass: mainshockMatches && Number.isFinite(remoteCount) && localCount === remoteCount };
    } catch (error) { return { sequence: s.key, pass: false, error: error.message }; }
  })));
}
console.table(results);
console.log('Snapshot downloaded:', D.fetchedAt);
console.log('This checks mainshock metadata and aggregate M5+ counts, not every event, grid value or model assumption.');
if (results.some(r => !r.pass)) {
  console.error('USGS differs or could not be checked. Investigate revisions, rounded coverage cutoffs, or service availability before refreshing.');
  process.exitCode = 1;
}
