// Download everything the app needs from the USGS earthquake API (free, no key):
//   data/sequences.json                   catalogue (M4+ near each mainshock) + ShakeMap grids (MMI, Vs30)
//   data/ground-failure-and-pager.json    liquefaction/landslide grids + PAGER exposure and building notes
//   data/aftershock-shakemap-check.json   intensity-equation vs ShakeMap gap for big aftershocks
// Run from the repo root after `npm install`:  node scripts/fetch_usgs.mjs
// Needs Node 18+ (built-in fetch). Takes a few minutes: ShakeMap grids are 5-35 MB each.
import fs from 'node:fs';
import { fromUrl } from 'geotiff';

const API = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&';
const q = p => fetch(API + new URLSearchParams(p)).then(r => r.json());
const text = u => fetch(u).then(r => r.text());
const b64 = u8 => Buffer.from(u8).toString('base64');

// [key, USGS event id, label]
const MAINS = [
  ['turkey', 'us6000jllz', 'Kahramanmaraş, Türkiye'], ['nepal', 'us20002926', 'Gorkha, Nepal'],
  ['darfield', 'usp000hk46', 'Canterbury, New Zealand'], ['noto', 'us6000m0xl', 'Noto Peninsula, Japan'],
  ['kaikoura', 'us1000778i', 'Kaikōura, New Zealand'], ['ridgecrest', 'ci38457511', 'Ridgecrest, California'],
  ['myanmar', 'us7000pn9s', 'Mandalay, Myanmar'], ['kumamoto', 'us20005iis', 'Kumamoto, Japan'],
  ['ecuador', 'us20005j32', 'Muisne, Ecuador'], ['morocco', 'us7000kufc', 'Al Haouz, Morocco'],
  ['indonesia26', 'us6000tkt2', 'Flores, Indonesia'], ['panama26', 'us6000u18k', 'Veraguas, Panama'],
  ['nagqu26', 'us6000u43g', 'Nagqu, Tibet (China)'],
];

// ---------- catalogue ----------
async function sequence([key, id, label]) {
  const ev = await q({ eventid: id });
  const M = ev.properties.mag, t0 = ev.properties.time, [lon, lat, depth] = ev.geometry.coordinates;
  const L = Math.pow(10, -2.44 + 0.59 * M);               // Wells & Coppersmith rupture length, km
  const radiusKm = Math.round(L * 1.2 + 30);
  const end = Math.min(t0 + (key === 'darfield' ? 200 : 150) * 864e5, Date.now());
  const d = await q({ starttime: new Date(t0 - 2 * 864e5).toISOString(), endtime: new Date(end).toISOString(),
    latitude: lat, longitude: lon, maxradiuskm: radiusKm, minmagnitude: 4, orderby: 'time-asc', limit: 20000 });
  const events = d.features.map(f => [+((f.properties.time - t0) / 864e5).toFixed(5), f.properties.mag,
    +f.geometry.coordinates[1].toFixed(3), +f.geometry.coordinates[0].toFixed(3)]);
  return { key, id, label, place: ev.properties.place, M, t0: new Date(t0).toISOString(), lat, lon, depth, radiusKm,
    daysAvailable: +((end - t0) / 864e5).toFixed(2), events, products: ev.properties.products };
}

// ---------- ShakeMap grid (MMI + Vs30), clipped to the aftershock zone ----------
function parseGrid(txt) {
  const spec = txt.match(/<grid_specification[^>]*>/)[0], at = k => +spec.match(new RegExp(k + '="([^"]+)"'))[1];
  const fields = Object.fromEntries([...txt.matchAll(/<grid_field index="(\d+)" name="(\w+)"/g)].map(m => [m[2], +m[1] - 1]));
  let lonMax = at('lon_max'); const lon0 = at('lon_min'); if (lonMax < lon0) lonMax += 360; // grids that cross 180°
  const nlon = at('nlon'), nlat = at('nlat'), lat1 = at('lat_max');
  return { txt, fields, lon0, lonMax, latMin: at('lat_min'), lat1, nlon, dlon: (lonMax - lon0) / (nlon - 1), dlat: (lat1 - at('lat_min')) / (nlat - 1),
    body: txt.slice(txt.indexOf('<grid_data>') + 11, txt.indexOf('</grid_data>')).trim().split('\n') };
}
async function shakemap(s) {
  const g = parseGrid(await text(s.products.shakemap[0].contents['download/grid.xml'].url));
  const R = s.radiusKm + 40, dLat = R / 111, dLon = R / (111 * Math.cos(s.lat * Math.PI / 180));
  const box = { latMin: Math.max(g.latMin, s.lat - dLat), latMax: Math.min(g.lat1, s.lat + dLat), lonMin: Math.max(g.lon0, s.lon - dLon), lonMax: Math.min(g.lonMax, s.lon + dLon) };
  const c0 = Math.ceil((box.lonMin - g.lon0) / g.dlon), c1 = Math.floor((box.lonMax - g.lon0) / g.dlon);
  const r0 = Math.ceil((g.lat1 - box.latMax) / g.dlat), r1 = Math.floor((g.lat1 - box.latMin) / g.dlat);
  const nc = c1 - c0 + 1, nr = r1 - r0 + 1, mmi = new Uint8Array(nc * nr), vs = new Uint8Array(nc * nr);
  for (let rr = 0; rr < nr; rr++) for (let cc = 0; cc < nc; cc++) {
    const line = g.body[(r0 + rr) * g.nlon + c0 + cc]; if (!line) continue; const v = line.split(' ');
    mmi[rr * nc + cc] = Math.round(+v[g.fields.MMI] * 20);                    // MMI x 20
    vs[rr * nc + cc] = Math.min(255, Math.round(+v[g.fields.SVEL] / 8));      // Vs30 / 8 m/s
  }
  const attr = k => (g.txt.match(new RegExp(k + '="([^"]*)"')) || [])[1];
  return { lon0: +(g.lon0 + c0 * g.dlon).toFixed(5), lat0: +(g.lat1 - r0 * g.dlat).toFixed(5), dlon: +g.dlon.toFixed(6), dlat: +g.dlat.toFixed(6), nc, nr,
    mmi: b64(mmi), vs30: b64(vs), version: attr('shakemap_version'), processed: attr('process_timestamp'),
    obs: +attr('intensity_observations') || 0, stations: +attr('seismic_stations') || 0, pointSource: attr('point_source'), status: attr('map_status') };
}

// ---------- ground failure GeoTIFFs resampled onto the ShakeMap grid ----------
async function sampleTif(url, G, scale, cap) {
  const img = await (await fromUrl(url)).getImage();
  const [x0, y0, x1, y1] = img.getBoundingBox(), W = img.getWidth(), H = img.getHeight(), px = (x1 - x0) / W, py = (y1 - y0) / H;
  const lon1 = G.lon0 + (G.nc - 1) * G.dlon, lat1 = G.lat0 - (G.nr - 1) * G.dlat;
  const c0 = Math.max(0, Math.floor((G.lon0 - x0) / px)), c1 = Math.min(W, Math.ceil((lon1 - x0) / px) + 1);
  const r0 = Math.max(0, Math.floor((y1 - G.lat0) / py)), r1 = Math.min(H, Math.ceil((y1 - lat1) / py) + 1);
  if (c1 <= c0 || r1 <= r0) return null;
  const ras = (await img.readRasters({ window: [c0, r0, c1, r1], samples: [0] }))[0], ww = c1 - c0;
  const out = new Uint8Array(G.nc * G.nr); let max = 0, nonzero = 0;
  for (let r = 0; r < G.nr; r++) { const rr = Math.floor((y1 - (G.lat0 - r * G.dlat)) / py) - r0; if (rr < 0 || rr >= r1 - r0) continue;
    for (let c = 0; c < G.nc; c++) { const cc = Math.floor((G.lon0 + c * G.dlon - x0) / px) - c0; if (cc < 0 || cc >= ww) continue;
      const v = ras[rr * ww + cc]; if (!(v > 0) || v >= 1) continue;                // 999 = no data in older products
      max = Math.max(max, v); const b = Math.min(255, Math.round(Math.min(v, cap) * scale)); out[r * G.nc + c] = b; if (b) nonzero++ } }
  return { b: b64(out), max: +max.toFixed(3), nonzero };
}
async function extras(s, G) {
  const e = {}, P = s.products;
  if (P['ground-failure']) {
    const c = P['ground-failure'][0].contents, info = await (await fetch(c['info.json'].url)).json();
    const lsKey = Object.keys(c).find(k => /^jessee_201\d_model\.tif$/.test(k));
    e.liq = c['zhu_2017_general_model.tif'] ? await sampleTif(c['zhu_2017_general_model.tif'].url, G, 500, 0.5) : null;  // fraction x 500
    e.ls = lsKey ? await sampleTif(c[lsKey].url, G, 1000, 0.255) : null;                                                   // fraction x 1000
    const Ls = (info.Landslides || []).find(x => x.preferred) || {}, Lq = (info.Liquefaction || []).find(x => x.preferred) || {};
    e.gfInfo = { version: info.Summary.gf_version, lsModel: Ls.title, lqModel: Lq.title, lsPop: Ls.population_alert?.value, lqPop: Lq.population_alert?.value, lsAlert: Ls.alert, lqAlert: Lq.alert };
  }
  if (P.losspager) {
    const x = await text(P.losspager[0].contents['pager.xml'].url);
    e.pager = { version: (x.match(/version_number="(\d+)"/) || [])[1],
      alerts: [...x.matchAll(/<alert type="(\w+)" level="(\w+)"/g)].map(m => [m[1], m[2]]),
      struct: (x.match(/<structcomment>([\s\S]*?)<\/structcomment>/) || [])[1]?.trim(),
      secondary: (x.match(/<secondary_effects>([\s\S]*?)<\/secondary_effects>/) || [])[1]?.trim(),
      exposure: [...x.matchAll(/<exposure dmin="([\d.]+)" dmax="([\d.]+)" exposure="(\d+)"/g)].map(m => [+m[1], +m[2], +m[3]]).slice(0, 12) };
  }
  return e;
}

// ---------- check the intensity equation against ShakeMaps of big aftershocks ----------
const K = JSON.parse(fs.existsSync('data/site-term-fit.json') ? fs.readFileSync('data/site-term-fit.json') : '{"k":-1.771}').k;
const aww = (M, R) => 2.085 + 1.428 * M - 1.402 * Math.log(Math.sqrt(R * R + (-0.209 + 2.042 * Math.exp(M - 5)) ** 2)) + (R > 50 ? 0.078 * Math.log(R / 50) : 0);
async function aftershockCheck(s) {
  const t0 = Date.parse(s.t0), out = [];
  const d = await q({ starttime: new Date(t0 + 3600e3).toISOString(), endtime: new Date(Math.min(t0 + 200 * 864e5, Date.now())).toISOString(),
    latitude: s.lat, longitude: s.lon, maxradiuskm: s.radiusKm, minmagnitude: 5.5, maxmagnitude: 7.0, orderby: 'magnitude', limit: 4 });
  for (const f of d.features.slice(0, 3)) {
    const ev = await q({ eventid: f.id }); if (!ev.properties.products.shakemap) continue;
    const g = parseGrid(await text(ev.properties.products.shakemap[0].contents['download/grid.xml'].url));
    const [lon, lat, dep] = ev.geometry.coordinates, M = ev.properties.mag, c = Math.cos(lat * Math.PI / 180);
    let n = 0, sum = 0, sum2 = 0; const bins = {};
    for (let i = 0; i < g.body.length; i += 3) { const v = g.body[i].split(' '), dd = Math.hypot((+v[0] - lon) * 111 * c, (+v[1] - lat) * 111); if (dd > 100) continue;
      const vs = +v[g.fields.SVEL]; if (!(vs > 80)) continue;
      const r = +v[g.fields.MMI] - (aww(M, Math.sqrt(dd * dd + Math.max(dep, 5) ** 2)) + K * Math.log10(vs / 760));
      n++; sum += r; sum2 += r * r; const b = dd < 15 ? '<15' : dd < 40 ? '15-40' : '40-100'; (bins[b] ||= [0, 0]); bins[b][0] += r; bins[b][1]++ }
    out.push({ seq: s.key, id: f.id, M, dep, n, bias: +(sum / n).toFixed(2), sd: +Math.sqrt(sum2 / n - (sum / n) ** 2).toFixed(2),
      obs: +(g.txt.match(/intensity_observations="(\d+)"/) || [0, 0])[1], stations: +(g.txt.match(/seismic_stations="(\d+)"/) || [0, 0])[1],
      bins: Object.fromEntries(Object.entries(bins).map(([k, v]) => [k, +(v[0] / v[1]).toFixed(2)])) });
  }
  return out;
}

// ---------- run ----------
const sequences = [], shakemaps = {}, extra = {}, check = [];
for (const m of MAINS) {
  process.stdout.write(`${m[0]}… `);
  const s = await sequence(m);
  shakemaps[s.key] = await shakemap(s);
  extra[s.key] = await extras(s, shakemaps[s.key]);
  check.push(...await aftershockCheck(s));
  delete s.products; sequences.push(s);
  console.log(`${s.events.length} quakes, grid ${shakemaps[s.key].nc}x${shakemaps[s.key].nr}`);
}
fs.writeFileSync('data/sequences.json', JSON.stringify({ fetchedAt: new Date().toISOString(), catalogue: 'USGS ComCat FDSN event service',
  shakemap: 'USGS ShakeMap grid.xml (MMI, SVEL=Vs30), clipped to the aftershock zone', sequences, shakemaps }));
fs.writeFileSync('data/ground-failure-and-pager.json', JSON.stringify(extra));
fs.writeFileSync('data/aftershock-shakemap-check.json', JSON.stringify(check));
console.log('Done. Next: python scripts/fit_site_term.py, node scripts/prep_basemap.js, node scripts/prep_population.js, python scripts/build.py');
