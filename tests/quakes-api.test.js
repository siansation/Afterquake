const test=require('node:test');
const assert=require('node:assert/strict');
const {createHandler,parseQuery}=require('../api/quakes');
const {rowFromFeature,cellBox}=require('../server/quakes-store');
function response(){return {headers:{},code:200,setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this}}}
const query={lat:'37.2',lon:'37.0',radiusKm:'150',since:'2026-10-20T00:00:00Z',until:'2026-10-25T00:00:00Z'};
const req=(q=query,method='GET')=>({method,headers:{'x-forwarded-for':'1.2.3.4'},query:q});
function fakeStore(last=null){
  const s={upserts:0,marked:[],last,async upsert(rows){this.upserts+=rows.length;return rows.length},async buckets(){return [{hour:'2026-10-24T10:00:00.000Z',n:3,n4:2,n5:1,maxMag:5.2}]},
    async totalStored(){return 42},async lastIngest(k){return k==='feed'?this.last:null},async markIngest(k,n){this.marked.push([k,n]);if(k==='feed')this.last=new Date(clock).toISOString()},async timescale(){return true}};
  return s;
}
let clock=Date.parse('2026-10-24T12:00:00Z');
const okFeed=async()=>({ok:true,json:async()=>({features:[{id:'us1',properties:{mag:5.1,time:Date.parse('2026-10-24T11:00:00Z')},geometry:{coordinates:[37,37.2,10]}}]})});

test('availability probe works without a database and never exposes data',async()=>{
  const res=response();await createHandler({configured:()=>false})(req({}),res);
  assert.deepEqual(res.body,{configured:false,provider:'Tiger Data'});assert.equal(res.headers['Cache-Control'],'no-store');
  const on=response();await createHandler({configured:()=>true,store:fakeStore()})(req({}),on);
  assert.deepEqual(on.body,{configured:true,provider:'Tiger Data',timescale:true});
});
test('unconfigured servers answer 503 for data requests, and only GET is allowed',async()=>{
  const res=response();await createHandler({configured:()=>false})(req(),res);assert.equal(res.code,503);
  const post=response();await createHandler({configured:()=>true})(req(query,'POST'),post);assert.equal(post.code,405);assert.equal(post.headers.Allow,'GET');
});
test('query validation rejects bad coordinates, radii and windows before touching the store',async()=>{
  let touched=0;const store=new Proxy({},{get(){touched++;return async()=>null}});
  for(const q of [{...query,lat:'91'},{...query,lon:'x'},{...query,radiusKm:'5000'},{...query,since:'yesterday'},{...query,until:'2026-10-19T00:00:00Z'},{...query,since:'2024-01-01T00:00:00Z'}]){
    const res=response();await createHandler({configured:()=>true,throttle:()=>false,store})(req(q),res);assert.equal(res.code,400);
  }
  assert.equal(touched,0);assert.equal(parseQuery(query).radiusKm,150);
});
test('the USGS feed is pulled only when the stored copy is stale',async()=>{
  let pulls=0;const fetchImpl=async(...a)=>{pulls++;return okFeed(...a)};
  const store=fakeStore(new Date(clock-60e3).toISOString());
  const handler=createHandler({configured:()=>true,throttle:()=>false,store,fetchImpl,now:()=>clock});
  const fresh=response();await handler(req(),fresh);assert.equal(pulls,0);assert.equal(fresh.body.ingest.attempted,false);
  store.last=new Date(clock-5*60e3).toISOString();
  const stale=response();await handler(req(),stale);assert.equal(pulls,1);assert.equal(store.upserts,1);
  assert.deepEqual(stale.body.buckets[0],{hour:'2026-10-24T10:00:00.000Z',n:3,n4:2,n5:1,maxMag:5.2});
  assert.equal(stale.body.totalStored,42);assert.equal(stale.body.timescale,true);assert.equal(typeof stale.body.queryMs,'number');
});
test('a slow or failing USGS never fails the request; stored data is still returned',async()=>{
  const hang=(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
  const res=response();const t=Date.now();
  await createHandler({configured:()=>true,throttle:()=>false,store:fakeStore(),fetchImpl:hang,timeoutMs:50})(req(),res);
  assert.equal(res.code,200);assert.ok(Date.now()-t<2000);assert.match(res.body.ingest.error,/stored data/);assert.equal(res.body.buckets.length,1);
  const broken=response();await createHandler({configured:()=>true,throttle:()=>false,store:fakeStore(),fetchImpl:async()=>({ok:false,status:500})})(req(),broken);
  assert.equal(broken.code,200);assert.ok(broken.body.ingest.error);
});
test('regional backfill runs once per area and window, then waits',async()=>{
  let urls=[];const store=fakeStore(new Date(clock).toISOString());const marked={};
  store.lastIngest=async k=>k==='feed'?store.last:(marked[k]||null);store.markIngest=async(k)=>{marked[k]=new Date(clock).toISOString()};
  const handler=createHandler({configured:()=>true,throttle:()=>false,store,fetchImpl:async u=>{urls.push(u);return okFeed()},now:()=>clock});
  await handler(req({...query,backfill:'1'}),response());await handler(req({...query,backfill:'1'}),response());
  assert.equal(urls.length,1);assert.match(urls[0],/fdsnws\/event\/1\/query/);assert.match(urls[0],/maxradiuskm=150/);
});
test('database errors stay private and rate limits are explicit',async()=>{
  const store={...fakeStore(new Date(clock).toISOString()),async buckets(){throw new Error('postgres://user:secret@host/db')}};
  const res=response();await createHandler({configured:()=>true,throttle:()=>false,store,now:()=>clock})(req(),res);
  assert.equal(res.code,503);assert.ok(!JSON.stringify(res.body).includes('secret'));
  const lim=response();await createHandler({configured:()=>true,throttle:()=>true})(req(),lim);assert.equal(lim.code,429);assert.equal(lim.headers['Retry-After'],'60');
});
test('feed rows are validated before they reach SQL',()=>{
  assert.equal(rowFromFeature({id:"x'; DROP TABLE",properties:{mag:5,time:1},geometry:{coordinates:[0,0]}}),null);
  assert.equal(rowFromFeature({id:'ok1',properties:{mag:12,time:1},geometry:{coordinates:[0,0]}}),null);
  assert.equal(rowFromFeature({id:'ok1',properties:{mag:5,time:1},geometry:{coordinates:[0,95]}}),null);
  assert.deepEqual(cellBox(0,0,111.32).lat,[-4,4]);
});
