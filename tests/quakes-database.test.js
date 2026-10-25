// Run the aftershock time-series migration and store SQL in real PostgreSQL (PGlite).
// PGlite has no TimescaleDB, so this exercises the plain-PostgreSQL branch (table + view).
// The hypertable, continuous aggregate and policies run only on a Tiger Data service.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {createStore,rowFromFeature,cellBox}=require('../server/quakes-store');
const {createHandler}=require('../api/quakes');
const {createDevServer}=require('../scripts/dev');
const {caseRows}=require('../scripts/ingest_usgs');
const migration=fs.readFileSync(require.resolve('../db/quakes.sql'),'utf8');
let db,store;
const pool={query:(sql,args)=>db.query(sql,args)};
const feature=(id,iso,mag,lat,lon,updated=iso)=>({id,properties:{mag,time:Date.parse(iso),updated:Date.parse(updated),place:'Test place'},geometry:{coordinates:[lon,lat,10]}});
test.before(async()=>{db=new PGlite();await db.exec(migration);await db.exec(migration);store=createStore(pool)});
test.after(async()=>{await db.close()});
test.beforeEach(async()=>{await db.exec('TRUNCATE afterquake.quakes, afterquake.ingest_meta')});

test('migration is idempotent and exposes the same aggregate columns without TimescaleDB',async()=>{
  await db.exec(migration);
  const cols=(await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='afterquake' AND table_name='quake_rate_hourly' ORDER BY ordinal_position`)).rows.map(r=>r.column_name);
  assert.deepEqual(cols,['hour','cell_lat','cell_lon','n','n4','n5','max_mag']);
  assert.equal(await store.timescale(),false);
});
test('upserts keep one row per event and later USGS revisions replace earlier versions',async()=>{
  const rows=[feature('us1','2026-10-24T10:05:00Z',4.6,37.2,37.0),feature('us2','2026-10-24T10:40:00Z',5.3,37.3,37.1)].map(rowFromFeature);
  await store.upsert(rows);
  await store.upsert([rowFromFeature(feature('us1','2026-10-24T10:05:00Z',4.9,37.2,37.0,'2026-10-24T11:00:00Z'))]);
  // An older version arriving late must not overwrite the newer one.
  await store.upsert([rowFromFeature(feature('us1','2026-10-24T10:05:00Z',4.1,37.2,37.0,'2026-10-24T10:06:00Z'))]);
  assert.equal(await store.totalStored(),2);
  const mag=(await db.query("SELECT mag FROM afterquake.quakes WHERE id='us1'")).rows[0].mag;
  assert.ok(Math.abs(mag-4.9)<1e-6);
});
test('hourly buckets sum the cells around a point and respect the time window',async()=>{
  await store.upsert([
    feature('a','2026-10-24T10:05:00Z',4.2,37.20,37.00),feature('b','2026-10-24T10:50:00Z',5.1,37.40,37.30),
    feature('c','2026-10-24T11:10:00Z',3.0,37.10,36.90),feature('far','2026-10-24T10:20:00Z',6.0,10,10),
    feature('early','2026-10-23T09:00:00Z',4.0,37.2,37.0)].map(rowFromFeature));
  const b=await store.buckets({lat:37.2,lon:37.0,radiusKm:80,since:'2026-10-24T00:00:00Z',until:'2026-10-25T00:00:00Z'});
  assert.deepEqual(b.map(x=>[x.hour,x.n,x.n4,x.n5,x.maxMag]),[['2026-10-24T10:00:00.000Z',2,2,1,5.1],['2026-10-24T11:00:00.000Z',1,0,0,3]]);
});
test('areas crossing the 180-degree meridian include both sides',async()=>{
  await store.upsert([feature('w','2026-10-24T10:00:00Z',4.5,-17,179.9),feature('e','2026-10-24T10:30:00Z',4.5,-17,-179.9)].map(rowFromFeature));
  const b=await store.buckets({lat:-17,lon:179.95,radiusKm:60,since:'2026-10-24T00:00:00Z',until:'2026-10-25T00:00:00Z'});
  assert.equal(b[0].n,2);assert.equal(cellBox(-17,179.95,60).lon.length,2);
});
test('ingest bookkeeping records the latest pull per source',async()=>{
  assert.equal(await store.lastIngest('feed'),null);
  await store.markIngest('feed',12);const first=await store.lastIngest('feed');assert.ok(first);
  await store.markIngest('feed',15);assert.equal((await db.query("SELECT rows FROM afterquake.ingest_meta WHERE key='feed'")).rows[0].rows,15);
});
test('bundled case studies load into the series without network access',async()=>{
  const data=JSON.parse(fs.readFileSync(require.resolve('../data/sequences.json'),'utf8'));
  const rows=caseRows(data);await store.upsert(rows);
  assert.equal(await store.totalStored(),rows.length);
  const turkey=data.sequences.find(s=>s.key==='turkey');
  const b=await store.buckets({lat:turkey.lat,lon:turkey.lon,radiusKm:turkey.radiusKm,since:turkey.t0,until:new Date(Date.parse(turkey.t0)+864e5).toISOString()});
  assert.ok(b.reduce((n,x)=>n+x.n4,0)>50,'first day of the Türkiye sequence has many M4+ events');
});
test('the API ingests the USGS feed lazily and serves the series over HTTP',async()=>{
  let pulls=0,clock=Date.now();
  const fetchImpl=async()=>{pulls++;return {ok:true,json:async()=>({features:[feature('live1','2026-10-24T11:15:00Z',5.0,20,100),feature('bad',null,5,20,100)]})}};
  const handler=createHandler({store,configured:()=>true,throttle:()=>false,fetchImpl,now:()=>clock});
  const server=createDevServer({quakes:handler});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/api/quakes?lat=20&lon=100&radiusKm=100&since=2026-10-24T00:00:00Z&until=2026-10-24T23:00:00Z`;
  try{
    const one=await (await fetch(url)).json();
    assert.equal(pulls,1);assert.equal(one.buckets.length,1);assert.equal(one.buckets[0].n5,1);assert.equal(one.totalStored,1);assert.equal(one.timescale,false);
    clock+=60e3;await fetch(url);assert.equal(pulls,1,'fresh data is not fetched again');
    clock+=3*60e3;await fetch(url);assert.equal(pulls,2,'stale data is refreshed');
  }finally{server.close()}
});
