const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const LIVE=require('../src/live.js');
const t0=Date.now()-3*864e5;
function xml(version=1){
  const rows=[];for(let r=0;r<4;r++)for(let c=0;c<5;c++)rows.push(`${10+c*.1}   ${20.3-r*.1}\t${5+c*.1}  760`);
  return `<shakemap_grid shakemap_version="${version}" process_timestamp="2026-10-25T00:00:00Z"><grid_specification lon_min="10" lon_max="10.4" lat_min="20" lat_max="20.3" nlon="5" nlat="4"/><grid_field index="1" name="LON"/><grid_field index="2" name="LAT"/><grid_field index="3" name="MMI"/><grid_field index="4" name="SVEL"/><grid_data>\n${rows.join('\n')}\n</grid_data></shakemap_grid>`;
}
function product(type,version,weight=100){return {source:'us',code:'test',status:'UPDATE',updateTime:version,preferredWeight:weight,
  contents:type==='shakemap'?{'download/grid.xml':{url:'https://fixture.test/grid'}}:{'pager.xml':{url:'https://fixture.test/pager'}}}}
function fixture(){
  const state={sm:1,pager:1,grid:1,mag:7,time:t0,afterMag:5.2,failPager:false,badPager:false,noSM:false,noPager:false,requests:[]};
  state.fetch=async url=>{
    state.requests.push(String(url));const u=new URL(url);
    if(u.searchParams.has('eventid'))return {ok:true,json:async()=>({id:'usTest',geometry:{coordinates:[10.2,20.15,10]},properties:{mag:state.mag,time:state.time,updated:100,place:'Test quake',products:{
      shakemap:state.noSM?[{...product('shakemap',state.sm),status:'DELETE'}]:[product('shakemap',state.sm,100),product('shakemap',1000,1)],
      losspager:state.noPager?[]:[product('pager',state.pager)]}}})};
    if(u.hostname==='earthquake.usgs.gov')return {ok:true,json:async()=>({features:[
      {id:'usTest',properties:{mag:6.9,time:state.time+1},geometry:{coordinates:[10.2,20.15,10]}},
      {id:'usAfter',properties:{mag:state.afterMag,time:t0+864e5},geometry:{coordinates:[10.25,20.16,10]}}
    ]})};
    if(u.pathname==='/grid')return {ok:true,text:async()=>xml(state.grid)};
    if(state.failPager)return {ok:false,status:503};
    if(state.badPager)return {ok:true,text:async()=>'<html>Service unavailable</html>'};
    return {ok:true,text:async()=>`<pager version="2.1"><event number="${state.pager}"/><exposure dmin="6" dmax="7" exposure="100"/></pager>`};
  };
  return state;
}
async function usingFetch(f,fn){const old=global.fetch;global.fetch=f;try{return await fn()}finally{global.fetch=old}}

test('live load chooses preferred products and current mainshock details',async()=>{
  const f=fixture();await usingFetch(f.fetch,async()=>{
    const r=await LIVE.load('usTest');assert.equal(r.seq.M,7);assert.equal(r.shakemap.version,'1');
    assert.deepEqual(r.seq.events.find(e=>e[0]===0),[0,7,20.15,10.2]);
    assert.equal(r.seq.events.length,2);assert.equal(r.extra.pager.version,'1');assert.ok(r.seq.checkedAt);
  });
  const newer=product('shakemap',5,100),old=product('shakemap',1,100);
  assert.equal(LIVE.preferred({shakemap:[old,newer]},'shakemap'),newer);
});
test('unchanged products reuse downloads while revised same-count events are detected',async()=>{
  const f=fixture();await usingFetch(f.fetch,async()=>{
    const first=await LIVE.load('usTest');f.requests=[];f.afterMag=5.8;
    const next=await LIVE.load('usTest',()=>{},first);
    assert.equal(next.shakemap,first.shakemap);assert.equal(next.extra.pager,first.extra.pager);
    assert.equal(next.seq.events.length,first.seq.events.length);
    assert.equal(LIVE.catalogueChanged(next.seq.events,first.seq.events),true);
    assert.equal(f.requests.filter(u=>u.includes('fixture.test')).length,0);
  });
});
test('new ShakeMap and PAGER versions are downloaded and replace old products',async()=>{
  const f=fixture();await usingFetch(f.fetch,async()=>{
    const first=await LIVE.load('usTest');f.sm=2;f.pager=2;f.grid=2;f.requests=[];
    const next=await LIVE.load('usTest',()=>{},first);
    assert.notEqual(next.shakemap,first.shakemap);assert.equal(next.shakemap.version,'2');assert.equal(next.extra.pager.version,'2');
    assert.equal(f.requests.filter(u=>u.includes('fixture.test')).length,2);
  });
});
test('origin/magnitude revisions rebuild a grid even if its product version is unchanged',async()=>{
  const f=fixture();await usingFetch(f.fetch,async()=>{
    const first=await LIVE.load('usTest');f.mag=7.2;f.time+=60000;
    const next=await LIVE.load('usTest',()=>{},first);
    assert.notEqual(next.shakemap,first.shakemap);assert.equal(next.seq.t0,new Date(f.time).toISOString());
    assert.equal(first.seq.M,7,'Loading must not mutate the last successful packet');
  });
  assert.equal(LIVE.geometryVersion({M:7,t0:'x',lat:0,lon:190.3,radiusKm:100}),LIVE.geometryVersion({M:7,t0:'x',lat:0,lon:-169.7,radiusKm:100}));
});
test('withdrawn mandatory shaking products reject refresh; withdrawn PAGER is cleared',async()=>{
  const f=fixture();await usingFetch(f.fetch,async()=>{
    const first=await LIVE.load('usTest');f.noSM=true;
    await assert.rejects(LIVE.load('usTest',()=>{},first),/no current ShakeMap/);
    f.noSM=false;f.noPager=true;const next=await LIVE.load('usTest',()=>{},first);
    assert.equal(next.extra.pager,undefined);assert.equal(next.seq.productVersions.pager,'');
  });
});
test('optional PAGER failure preserves its old report, shows a warning and retries',async()=>{
  const f=fixture();await usingFetch(f.fetch,async()=>{
    const first=await LIVE.load('usTest');f.pager=2;f.failPager=true;
    const partial=await LIVE.load('usTest',()=>{},first);
    assert.equal(partial.extra.pager,first.extra.pager);assert.ok(partial.seq.warnings[0].includes('previous report'));
    assert.equal(partial.seq.productVersions.pager,first.seq.productVersions.pager);
    f.failPager=false;f.badPager=true;const malformed=await LIVE.load('usTest',()=>{},partial);
    assert.equal(malformed.extra.pager,first.extra.pager);assert.equal(malformed.seq.warnings.length,1);
    f.badPager=false;const next=await LIVE.load('usTest',()=>{},malformed);
    assert.equal(next.extra.pager.version,'2');assert.deepEqual(next.seq.warnings,[]);
  });
});
test('catalogue limits and invalid grids fail rather than silently building partial forecasts',async()=>{
  await usingFetch(async()=>({ok:true,json:async()=>({features:new Array(20000).fill(null)})}),async()=>{
    await assert.rejects(LIVE.catalogue({id:'test',t0:new Date(t0).toISOString(),lat:0,lon:0,radiusKm:100,M:7}),/20,000/);
  });
  const bad=LIVE.parseGrid(xml().replace('5  760','bad  760'));
  assert.throws(()=>LIVE.clipGrid(bad,{lat:20.15,lon:10.2,radiusKm:200}),/invalid shaking/);
});
test('network timeout aborts and is reported distinctly',async()=>{
  const ctx=vm.createContext({AbortController,URLSearchParams,fetch:(_u,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})))),
    setTimeout:fn=>{queueMicrotask(fn);return 1},clearTimeout(){}});
  new vm.Script(fs.readFileSync(require.resolve('../src/live.js'),'utf8')).runInContext(ctx);
  await assert.rejects(vm.runInContext('LIVE.feed()',ctx),/timed out/);
});
