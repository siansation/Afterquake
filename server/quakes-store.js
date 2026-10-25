// Aftershock time series in Tiger Data. Writes upsert USGS events (USGS revises
// magnitudes and locations, so a later version replaces the earlier row). Reads come
// from afterquake.quake_rate_hourly: a TimescaleDB continuous aggregate on Tiger, an
// ordinary view on plain PostgreSQL. All SQL uses bound parameters.
const KM_PER_DEG = 111.32;

// Bounding box of 0.25-degree cells around a point. Longitudes are split into one or
// two ranges so a box crossing the 180-degree meridian still works.
function cellBox(lat, lon, radiusKm) {
  const dLat = radiusKm / KM_PER_DEG;
  const dLon = Math.min(180, radiusKm / (KM_PER_DEG * Math.max(0.05, Math.cos(lat * Math.PI / 180))));
  const latLo = Math.max(-90, lat - dLat), latHi = Math.min(90, lat + dLat);
  let lonLo = lon - dLon, lonHi = lon + dLon;
  const ranges = [];
  if (dLon >= 180) ranges.push([-180, 180]);
  else if (lonLo < -180) ranges.push([lonLo + 360, 180], [-180, lonHi]);
  else if (lonHi > 180) ranges.push([lonLo, 180], [-180, lonHi - 360]);
  else ranges.push([lonLo, lonHi]);
  const cell = v => Math.floor(v * 4);
  return { lat: [cell(latLo), cell(latHi)], lon: ranges.map(([a, b]) => [cell(a), cell(b)]) };
}

// USGS GeoJSON feature -> row. Returns null for anything unusable.
function rowFromFeature(f) {
  const id = f?.id, p = f?.properties || {}, c = f?.geometry?.coordinates || [];
  const mag = Number(p.mag), at = Number(p.time), lon = Number(c[0]), lat = Number(c[1]), depth = c[2] == null ? null : Number(c[2]);
  if (typeof id !== 'string' || !/^[A-Za-z0-9:_.-]{1,80}$/.test(id)) return null;
  if (!Number.isFinite(mag) || mag < -2 || mag > 10 || !Number.isFinite(at)) return null;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) return null;
  return { id, at: new Date(at).toISOString(), mag, lat, lon, depth: Number.isFinite(depth) ? depth : null,
    place: String(p.place || '').slice(0, 200), updated: new Date(Number(p.updated) || at).toISOString() };
}

function createStore(pool) {
  const q = (sql, args) => pool.query(sql, args);
  return {
    async upsert(rows) {
      let written = 0;
      // Batches of 200 keep each statement well under parameter limits.
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200), args = [], values = [];
        batch.forEach((r, k) => {
          const o = k * 8;
          values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`);
          args.push(r.id, r.at, r.mag, r.lat, r.lon, r.depth, r.place, r.updated);
        });
        const res = await q(`INSERT INTO afterquake.quakes (id, at, mag, lat, lon, depth, place, updated)
          VALUES ${values.join(', ')}
          ON CONFLICT (id, at) DO UPDATE SET mag = EXCLUDED.mag, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
            depth = EXCLUDED.depth, place = EXCLUDED.place, updated = EXCLUDED.updated
          WHERE afterquake.quakes.updated <= EXCLUDED.updated`, args);
        written += res.rowCount ?? res.affectedRows ?? 0;
      }
      return written;
    },
    // Hourly counts summed over the cells covering a radius around (lat, lon).
    async buckets({ lat, lon, radiusKm, since, until }) {
      const box = cellBox(lat, lon, radiusKm), args = [since, until, box.lat[0], box.lat[1]];
      const lonSql = box.lon.map(([a, b]) => { args.push(a, b); return `(cell_lon BETWEEN $${args.length - 1} AND $${args.length})`; }).join(' OR ');
      const res = await q(`SELECT hour, sum(n)::int AS n, sum(n4)::int AS n4, sum(n5)::int AS n5, max(max_mag) AS max_mag
        FROM afterquake.quake_rate_hourly
        WHERE hour >= $1 AND hour < $2 AND cell_lat BETWEEN $3 AND $4 AND (${lonSql})
        GROUP BY hour ORDER BY hour LIMIT 2000`, args);
      return res.rows.map(r => ({ hour: new Date(r.hour).toISOString(), n: r.n, n4: r.n4, n5: r.n5,
        maxMag: r.max_mag == null ? null : Math.round(r.max_mag * 10) / 10 }));
    },
    async totalStored() {
      return (await q('SELECT count(*)::int AS n FROM afterquake.quakes')).rows[0].n;
    },
    async lastIngest(key = 'feed') {
      const r = (await q('SELECT at FROM afterquake.ingest_meta WHERE key = $1', [key])).rows[0];
      return r ? new Date(r.at).toISOString() : null;
    },
    async markIngest(key, rows) {
      await q(`INSERT INTO afterquake.ingest_meta (key, at, rows) VALUES ($1, now(), $2)
        ON CONFLICT (key) DO UPDATE SET at = now(), rows = EXCLUDED.rows`, [key, rows]);
    },
    async timescale() {
      return (await q("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') AS ok")).rows[0].ok;
    }
  };
}
module.exports = { createStore, rowFromFeature, cellBox };
