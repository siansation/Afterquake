// Execute the migration and store SQL in real PostgreSQL (PGlite/WASM). The
// TimescaleDB-specific hypertable conversion still needs a Tiger Cloud service.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {createStore}=require('../server/checkins-store');
const {createHandler}=require('../api/checkins');
const {createDevServer}=require('../scripts/dev');
const migration=fs.readFileSync(require.resolve('../db/checkins.sql'),'utf8');
let db,store;
const room='a'.repeat(64),alice='b'.repeat(64),bob='c'.repeat(64),seq='live:usTest';
const safe={status:'safe',lat:1,lon:2,note:'At the park'};
test.before(async()=>{
  db=new PGlite();await db.exec(migration);await db.exec(migration);
  store=createStore({async connect(){return {query:(...args)=>db.query(...args),release(){}}}});
});
test.after(async()=>{await db.close()});
test.beforeEach(async()=>{await db.exec('TRUNCATE afterquake.checkins, afterquake.checkin_events')});

test('two people share entries, update only their own and get distinct current versus historical counts',async()=>{
  await store.save(room,seq,alice,safe);await store.save(room,seq,bob,{...safe,status:'help'});
  const before=await store.list(room,seq,alice),id=before.items.find(d=>d.mine).id;
  assert.deepEqual(before.counts,{total:2,safe:1,help:1});assert.equal(before.items.filter(d=>d.mine).length,1);
  await store.save(room,seq,alice,{...safe,status:'help',note:'Changed plans'});
  const after=await store.list(room,seq,alice);
  assert.deepEqual(after.counts,{total:2,safe:0,help:2});assert.equal(after.items.find(d=>d.mine).id,id);
  assert.equal(after.items.find(d=>d.mine).note,'Changed plans');assert.equal(after.activity.reduce((n,d)=>n+d.safe+d.help,0),3);
});
test('groups and earthquakes are isolated, and another owner cannot remove an entry',async()=>{
  await store.save(room,seq,alice,safe);
  assert.equal((await store.list('d'.repeat(64),seq,alice)).items.length,0);
  assert.equal((await store.list(room,'turkey',alice)).items.length,0);
  await store.remove(room,seq,bob);assert.equal((await store.list(room,seq,alice)).items.length,1);
});
test('removing your entry also removes your history without removing another person',async()=>{
  await store.save(room,seq,alice,safe);await store.save(room,seq,bob,{...safe,status:'help'});
  await store.remove(room,seq,alice);const result=await store.list(room,seq,bob);
  assert.equal(result.items.length,1);assert.equal(result.items[0].mine,true);
  assert.deepEqual(result.counts,{total:1,safe:0,help:1});assert.equal(result.activity.reduce((n,d)=>n+d.safe+d.help,0),1);
});
test('expired posts are hidden immediately and old records are cleaned on the next write',async()=>{
  await store.save(room,seq,alice,safe);
  await db.exec("UPDATE afterquake.checkins SET expires_at=now()-interval '1 minute'; UPDATE afterquake.checkin_events SET at=now()-interval '25 hours'");
  const old=await store.list(room,seq,alice);assert.equal(old.items.length,0);assert.equal(old.activity.length,0);
  await store.save(room,seq,bob,safe);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM afterquake.checkins')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM afterquake.checkin_events')).rows[0].n,1);
});
test('history failure rolls back a current-entry update',async()=>{
  const broken=createStore({async connect(){return {release(){},async query(sql,args){if(sql.includes('INSERT INTO afterquake.checkin_events'))throw new Error('history failure');return db.query(sql,args)}}}});
  await assert.rejects(broken.save(room,seq,alice,safe),/history failure/);
  assert.equal((await store.list(room,seq,alice)).items.length,0);
});
test('API ownership and parameterised SQL work together against PostgreSQL',async()=>{
  const handler=createHandler({store,configured:()=>true,throttle:()=>false}),group='1'.repeat(32);
  const server=createDevServer({checkins:handler});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function call(method,token,body){
    const res=await fetch(base+'/api/checkins?sequence='+seq,{method,headers:{authorization:'Bearer '+group,'x-checkin-owner':token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');return res.json();
  }
  try{
  const a='2'.repeat(64),b='3'.repeat(64),note="'); DELETE FROM afterquake.checkins; --";
  await call('PUT',a,{...safe,sequence:seq,note});await call('DELETE',b);
  const viewed=await call('GET',b);assert.equal(viewed.items.length,1);assert.equal(viewed.items[0].mine,false);assert.equal(viewed.items[0].note,note);
  assert.ok(!JSON.stringify(viewed).includes(a));assert.ok(!JSON.stringify(viewed).includes(group));
  await call('DELETE',a);assert.equal((await call('GET',b)).items.length,0);
  assert.equal((await fetch(base,{method:'HEAD'})).status,200);
  assert.equal((await fetch(base+'/package.json')).status,404,'Local server must not serve configuration or source files');
  }finally{await new Promise(resolve=>server.close(resolve))}
});
