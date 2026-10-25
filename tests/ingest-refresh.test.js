const test=require('node:test');
const assert=require('node:assert/strict');
const {refreshImported}=require('../scripts/ingest_usgs');
const {createStore}=require('../server/quakes-store');

test('historic case imports refresh separate date ranges outside the rolling policy',async()=>{
  const calls=[];
  await refreshImported({timescale:async()=>true,refreshRange:async(...args)=>calls.push(args)},[
    {id:'case:turkey:0',at:'2023-02-06T01:17:00Z'},
    {id:'case:turkey:1',at:'2023-02-07T02:10:00Z'},
    {id:'case:noto:0',at:'2024-01-01T07:10:00Z'}
  ]);
  assert.deepEqual(calls,[['2023-02-06T01:17:00.000Z','2023-02-07T02:10:00.001Z'],['2024-01-01T07:10:00.000Z','2024-01-01T07:10:00.001Z']]);
});
test('plain PostgreSQL and empty imports never call the Timescale-only refresh procedure',async()=>{
  let calls=0;const store={timescale:async()=>false,refreshRange:async()=>calls++};
  await refreshImported(store,[{id:'us1',at:'2026-10-24T10:00:00Z'}]);await refreshImported(store,[]);assert.equal(calls,0);
});
test('manual refresh covers complete historic UTC hours and excludes the live partial hour',async()=>{
  const calls=[],store=createStore({query:async(sql,args)=>{calls.push({sql,args});return {rows:[]}}});
  await store.refreshRange('2023-02-06T01:17:00Z','2023-02-06T02:10:00Z');
  assert.match(calls[0].sql,/CALL refresh_continuous_aggregate/);
  assert.deepEqual(calls[0].args,['2023-02-06T01:00:00.000Z','2023-02-06T03:00:00.000Z']);
  const hour=3600e3,now=Date.now(),currentHour=Math.floor(now/hour)*hour;
  await store.refreshRange(new Date(currentHour-hour).toISOString(),new Date(now+hour).toISOString());
  assert.equal(calls[1].args[1],new Date(currentHour).toISOString());
});
