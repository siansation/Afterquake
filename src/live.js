// Live USGS data for the world view, fetched in the browser (USGS allows cross-origin requests, no key):
//   feed()    M4.5+ earthquakes worldwide in the last 30 days, for the globe
//   load(id)  everything one earthquake's forecast needs: catalogue, ShakeMap grid (MMI, Vs30), PAGER exposure
// Mirrors scripts/fetch_usgs.mjs (catalogue, grid clipping, PAGER parsing) and scripts/prep_basemap.js (coast clipping),
// but keeps the grids as byte arrays instead of base64. Ground-failure GeoTIFFs are not loaded for live events.
const LIVE = (() => {
  const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson';
  const API = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&';
  const get = async (u, how) => { const r = await fetch(u); if (!r.ok) throw new Error(`USGS returned HTTP ${r.status}`); return r[how]() };
  const q = p => get(API + new URLSearchParams(p), 'json');
  const wrap = (lon, ref) => lon + 360 * Math.round((ref - lon) / 360);   // same side of 180° as ref
  const lon180 = lon => ((lon + 540) % 360) - 180;

  async function feed() {
    const j = await get(FEED, 'json');
    return { generated: j.metadata.generated, quakes: j.features.filter(f => f.properties.mag != null).map(f => {
      const p = f.properties, [lon, lat, depth] = f.geometry.coordinates;
      return { id: f.id, ids: p.ids, M: p.mag, place: p.place || p.title, t: p.time, lon, lat, depth, url: p.url,
        shakemap: /,shakemap,/.test(p.types), alert: p.alert, tsunami: p.tsunami, felt: p.felt };
    }) };
  }

  // Wells & Coppersmith rupture length, as in fetch_usgs.mjs
  const radiusKm = M => Math.round(Math.pow(10, -2.44 + 0.59 * M) * 1.2 + 30);

  async function catalogue(s) {
    const t0 = Date.parse(s.t0), end = Date.now();
    const d = await q({ starttime: new Date(t0 - 2 * 864e5).toISOString(), endtime: new Date(end).toISOString(),
      latitude: s.lat, longitude: lon180(s.lon), maxradiuskm: s.radiusKm, minmagnitude: 4, orderby: 'time-asc', limit: 20000 });
    const events = d.features.filter(f => f.properties.mag != null).map(f => [+((f.properties.time - t0) / 864e5).toFixed(5), f.properties.mag,
      +f.geometry.coordinates[1].toFixed(3), +wrap(f.geometry.coordinates[0], s.lon).toFixed(3)]);
    // The mainshock is in the catalogue at t = 0; keep it even if a revision moved its time by a fraction of a second.
    if (!events.some(e => Math.abs(e[0]) < 1e-4)) events.push([0, s.M, +s.lat.toFixed(3), +s.lon.toFixed(3)]);
    events.sort((a, b) => a[0] - b[0]);
    return { events, daysAvailable: +((end - t0) / 864e5).toFixed(4), fetchedAt: new Date(end).toISOString() };
  }

  function parseGrid(txt) {
    const spec = txt.match(/<grid_specification[^>]*>/)[0], at = k => +spec.match(new RegExp(k + '="([^"]+)"'))[1];
    const fields = Object.fromEntries([...txt.matchAll(/<grid_field index="(\d+)" name="(\w+)"/g)].map(m => [m[2], +m[1] - 1]));
    let lonMax = at('lon_max'); const lon0 = at('lon_min'); if (lonMax < lon0) lonMax += 360; // grids that cross 180°
    const nlon = at('nlon'), nlat = at('nlat'), lat1 = at('lat_max');
    return { txt, fields, lon0, lonMax, latMin: at('lat_min'), lat1, nlon, dlon: (lonMax - lon0) / (nlon - 1), dlat: (lat1 - at('lat_min')) / (nlat - 1),
      body: txt.slice(txt.indexOf('<grid_data>') + 11, txt.indexOf('</grid_data>')).trim().split('\n') };
  }
  // Same clipping and scaling as fetch_usgs.mjs: MMI x 20, Vs30 / 8 m/s, box of radiusKm + 40 around the epicentre
  function clipGrid(g, s) {
    const R = s.radiusKm + 40, dLat = R / 111, dLon = R / (111 * Math.cos(s.lat * Math.PI / 180));
    const box = { latMin: Math.max(g.latMin, s.lat - dLat), latMax: Math.min(g.lat1, s.lat + dLat), lonMin: Math.max(g.lon0, s.lon - dLon), lonMax: Math.min(g.lonMax, s.lon + dLon) };
    const c0 = Math.ceil((box.lonMin - g.lon0) / g.dlon), c1 = Math.floor((box.lonMax - g.lon0) / g.dlon);
    const r0 = Math.ceil((g.lat1 - box.latMax) / g.dlat), r1 = Math.floor((g.lat1 - box.latMin) / g.dlat);
    const nc = c1 - c0 + 1, nr = r1 - r0 + 1;
    if (!(nc > 1 && nr > 1)) throw new Error('The ShakeMap does not cover the aftershock zone.');
    const mmi = new Uint8Array(nc * nr), vs = new Uint8Array(nc * nr);
    for (let rr = 0; rr < nr; rr++) for (let cc = 0; cc < nc; cc++) {
      const line = g.body[(r0 + rr) * g.nlon + c0 + cc]; if (!line) continue; const v = line.split(' ');
      mmi[rr * nc + cc] = Math.round(+v[g.fields.MMI] * 20);
      vs[rr * nc + cc] = Math.min(255, Math.round(+v[g.fields.SVEL] / 8));
    }
    const attr = k => (g.txt.match(new RegExp(k + '="([^"]*)"')) || [])[1];
    return { lon0: +(g.lon0 + c0 * g.dlon).toFixed(5), lat0: +(g.lat1 - r0 * g.dlat).toFixed(5), dlon: +g.dlon.toFixed(6), dlat: +g.dlat.toFixed(6), nc, nr,
      mmi, vs30: vs, version: attr('shakemap_version'), processed: attr('process_timestamp'),
      obs: +attr('intensity_observations') || 0, stations: +attr('seismic_stations') || 0, pointSource: attr('point_source'), status: attr('map_status') };
  }
  function parsePager(x) {
    return { version: (x.match(/version_number="(\d+)"/) || [])[1],
      alerts: [...x.matchAll(/<alert type="(\w+)" level="(\w+)"/g)].map(m => [m[1], m[2]]),
      struct: (x.match(/<structcomment>([\s\S]*?)<\/structcomment>/) || [])[1]?.trim(),
      secondary: (x.match(/<secondary_effects>([\s\S]*?)<\/secondary_effects>/) || [])[1]?.trim(),
      exposure: [...x.matchAll(/<exposure dmin="([\d.]+)" dmax="([\d.]+)" exposure="(\d+)"/g)].map(m => [+m[1], +m[2], +m[3]]).slice(0, 12) };
  }

  // step(name) reports progress: 'event', 'catalogue', 'shakemap', 'pager'
  async function load(id, step = () => {}) {
    step('event');
    const ev = await q({ eventid: id }), P = ev.properties.products || {};
    if (!P.shakemap) throw new Error('USGS has not published a ShakeMap for this earthquake yet, so there is no ground-shaking data to forecast from.');
    const M = ev.properties.mag, [lon, lat, depth] = ev.geometry.coordinates;
    const seq = { key: 'live:' + ev.id, id: ev.id, live: true, label: ev.properties.place || ev.properties.title, place: 'live USGS data',
      M, t0: new Date(ev.properties.time).toISOString(), lat, lon, depth, radiusKm: radiusKm(M) };
    step('shakemap');
    const g = parseGrid(await get(P.shakemap[0].contents['download/grid.xml'].url, 'text'));
    if (seq.lon < g.lon0 - 180) seq.lon += 360;                          // work in the grid's longitude frame near 180°
    const shakemap = clipGrid(g, seq);
    step('catalogue');
    Object.assign(seq, await catalogue(seq));
    step('pager');
    let pager = null;
    if (P.losspager) try { pager = parsePager(await get(P.losspager[0].contents['pager.xml'].url, 'text')) } catch (e) { /* PAGER is optional */ }
    return { seq, shakemap, extra: pager ? { pager } : {} };
  }

  // ---------- coastlines, borders and towns for a live grid (as scripts/prep_basemap.js) ----------
  function sh(ring, b) { // Sutherland-Hodgman clip to rectangle
    const edges = [[p => p[0] >= b.w, (a, c) => { const t = (b.w - a[0]) / (c[0] - a[0]); return [b.w, a[1] + t * (c[1] - a[1])] }], [p => p[0] <= b.e, (a, c) => { const t = (b.e - a[0]) / (c[0] - a[0]); return [b.e, a[1] + t * (c[1] - a[1])] }],
      [p => p[1] >= b.s, (a, c) => { const t = (b.s - a[1]) / (c[1] - a[1]); return [a[0] + t * (c[0] - a[0]), b.s] }], [p => p[1] <= b.n, (a, c) => { const t = (b.n - a[1]) / (c[1] - a[1]); return [a[0] + t * (c[0] - a[0]), b.n] }]];
    let out = ring; for (const [ins, cut] of edges) { const inp = out; out = []; for (let i = 0; i < inp.length; i++) { const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      if (ins(cur)) { if (!ins(prev)) out.push(cut(prev, cur)); out.push(cur) } else if (ins(prev)) out.push(cut(prev, cur)) } if (!out.length) break } return out }
  function clipLine(line, b) { const segs = []; let cur = []; const inb = p => p[0] >= b.w && p[0] <= b.e && p[1] >= b.s && p[1] <= b.n; for (const p of line) { if (inb(p)) cur.push(p); else { if (cur.length > 1) segs.push(cur); cur = [] } } if (cur.length > 1) segs.push(cur); return segs }
  function clipGeom(geom, b, shift) {
    const out = [], line = geom.type.includes('Line');
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates.map(l => [l]) : [[geom.coordinates]];
    for (const poly of polys) for (const ring of poly) {
      let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9; for (const [x, y] of ring) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y) }
      if (mxx < b.w || mnx > b.e || mxy < b.s || mny > b.n) continue;
      for (const part of line ? clipLine(ring, b) : [sh(ring, b)]) { const r = []; let last = null;
        for (const [x, y] of part) { if (last && Math.abs(x - last[0]) < 0.008 && Math.abs(y - last[1]) < 0.008) continue; r.push([+(x - shift).toFixed(3), +y.toFixed(3)]); last = [x, y] }
        if (r.length > 1) out.push(r) } }
    return out;
  }
  // geo: {land: GeoJSON FeatureCollection, borders: MultiLineString}; towns: [name, lat, lon, population, country]
  function basemap(geo, G, s, towns) {
    const w = G.lon0, e = G.lon0 + (G.nc - 1) * G.dlon, n = G.lat0, so = G.lat0 - (G.nr - 1) * G.dlat, pad = 0.3;
    const land = [], borders = [];
    for (const shift of [-360, 0, 360]) {                               // a grid past 180° needs land from the other side
      const b = { w: w - pad + shift, e: e + pad + shift, s: so - pad, n: n + pad };
      if (b.e < -180 || b.w > 180) continue;
      for (const f of geo.land.features) land.push(...clipGeom(f.geometry, b, shift));
      borders.push(...clipGeom(geo.borders, b, shift));
    }
    const inGrid = [];
    for (const t of towns) { const lon = wrap(t[2], s.lon); if (lon >= w && lon <= e && t[1] >= so && t[1] <= n) inGrid.push([t[0], t[1], lon, t[3], t[4]]) }
    const c = Math.cos(s.lat * Math.PI / 180), dist = t => Math.hypot((t[1] - s.lat) * 110.57, (t[2] - s.lon) * 111.32 * c);
    const nearest = inGrid.reduce((m, t) => (!m || dist(t) < dist(m) ? t : m), null);
    const country = nearest && dist(nearest) < 300 ? nearest[4] : null;
    return { base: { land, borders, towns: inGrid.map(t => [t[0], t[1], t[2], t[4]]), labels: nearest ? [nearest[0]] : [] },
      towns: { towns: inGrid, country }, country };
  }

  return { FEED, feed, load, catalogue, parseGrid, clipGrid, parsePager, basemap, radiusKm };
})();
if (typeof module !== 'undefined') module.exports = LIVE;
