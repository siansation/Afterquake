// Behaviour checks for live refresh application; map drawing is replaced by test doubles.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const LIVE=require('../src/live.js');
function harness(load){
  const nodes=new Map(),calls={update:0,install:[],times:[],picks:[],speech:0};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='now'?'500':'',textContent:'',innerHTML:'',hidden:false,disabled:false,
    classList:{toggle(){}},focus(){}});return nodes.get(id)};
  const grid={dlat:.1,version:'1'},seq={key:'live:usTest',id:'usTest',live:true,M:7,t0:'2026-10-01T00:00:00Z',lat:0,lon:0,
    fetchedAt:new Date().toISOString(),checkedAt:new Date().toISOString(),warnings:[],events:[[0,7,0,0]],daysAvailable:10};
  const ctx=vm.createContext({S:seq,G:grid,D:{shakemaps:{[seq.key]:grid}},EX:{[seq.key]:{}},BASE:{[seq.key]:{}},POP:{towns:{},seqCountry:{}},
    WGEO:{},WTOWNS:[],liveSeqs:{},loadingLive:false,mode:'detail',playing:false,tourOn:false,POLL_MS:120000,replayTimeOverride:1,
    currentDays:3,heatKey:'cached',loc:{lat:1,lon:2,name:'A'},comparisonLocation:{lat:2,lon:3,name:'B'},
    LIVE:{...LIVE,load,basemap:()=>({base:{},towns:{},country:'US'})},$:node,
    selectedDays:()=>ctx.currentDays,timelineBounds(){},setAbsoluteReplayTime(t){calls.times.push(t)},
    installSequenceGrid(fit){calls.install.push(fit);ctx.G=ctx.D.shakemaps[ctx.S.key]},gridAt:()=>({vs:760}),
    setLoc(lat,lon,name){ctx.loc={lat,lon,name}},defaultSpot(){throw new Error('Should not reset A')},resetComparison(){ctx.comparisonLocation=null},buildBuildingOptions(){},
    renderHeader(){},renderLedger(){},renderPager(){},renderEvents(){},update(){calls.update++},updateSpokenSummary(){calls.speech++},
    fmtDT:d=>d.toISOString(),fmtDate:d=>d.toISOString(),fmtClock:d=>d.toISOString(),esc:s=>s,selectTab(){},
    pickSeq(s){ctx.S=s;calls.picks.push(s.id);vm.runInContext('liveOpenToken++',ctx)}});
  new vm.Script(fs.readFileSync(require.resolve('../src/live-controls.js'),'utf8')).runInContext(ctx);
  return {ctx,node,calls,seq,grid,run:s=>vm.runInContext(s,ctx)};
}
function packet(h,overrides={}){return {seq:{...h.seq,refreshing:undefined,events:[[0,7,0,0],[1,5.8,1,1]],fetchedAt:new Date().toISOString(),...overrides},shakemap:h.grid,extra:{}}}

test('same-count revisions invalidate shading and retain the selected absolute time',async()=>{
  let result;const h=harness(async()=>result);h.seq.events=[[0,7,0,0],[1,5.2,1,1]];
  result=packet(h,{t0:'2026-10-01T01:00:00Z'});
  const expected=Date.parse(h.seq.t0)+3*864e5;await h.run('refreshLive()');
  assert.equal(h.ctx.heatKey,'');assert.equal(h.calls.update,1);assert.equal(h.calls.times[0],expected);
  assert.equal(h.ctx.loc.name,'A');assert.equal(h.ctx.comparisonLocation.name,'B');assert.equal(h.seq.events[1][1],5.8);
});
test('updated shaking grids are installed without resetting the camera or A/B',async()=>{
  let result;const h=harness(async()=>result);result=packet(h);result.shakemap={dlat:.1,version:'2'};
  await h.run('refreshLive()');assert.deepEqual(h.calls.install,[false]);assert.equal(h.ctx.G.version,'2');
  assert.equal(h.ctx.loc.name,'A');assert.equal(h.ctx.comparisonLocation.name,'B');
});
test('failed updates retain last successful data and make failure visible',async()=>{
  const h=harness(async()=>{throw new Error('network unavailable')}),oldTime=h.seq.fetchedAt;h.node('now').value='1000';h.ctx.replayTimeOverride=null;
  await h.run('refreshLive()');assert.equal(h.seq.fetchedAt,oldTime);assert.equal(h.ctx.D.shakemaps[h.seq.key],h.grid);
  assert.equal(h.calls.update,0);assert.ok(h.node('dataStatus').textContent.includes('Last refresh failed'));
  assert.ok(h.node('hNote').textContent.includes('Updates delayed'));assert.equal(h.seq.refreshing,false);assert.equal(h.calls.speech,1);
});
test('overlapping refreshes are suppressed and a pending response cannot replace another quake',async()=>{
  let finish,count=0;const h=harness(()=>{count++;return new Promise(resolve=>finish=resolve)});
  const first=h.run('refreshLive()');assert.equal(await h.run('refreshLive()'),null);assert.equal(count,1);
  const result=packet(h);h.ctx.S={...h.seq,key:'other'};finish(result);assert.equal(await first,null);
  assert.equal(h.calls.update,0);assert.equal(h.seq.refreshing,false);
});
test('live-following stays at the latest time after a successful refresh',async()=>{
  let result;const h=harness(async()=>result);result=packet(h);h.ctx.replayTimeOverride=null;h.node('now').value='1000';
  await h.run('refreshLive()');assert.equal(h.node('now').value,1000);assert.equal(h.calls.times.length,0);
});
test('the latest selected live quake wins when initial downloads complete out of order',async()=>{
  const pending={};const h=harness(id=>new Promise(resolve=>pending[id]=resolve));
  const a=h.run('openLive({id:"usA"})'),b=h.run('openLive({id:"usB"})');
  const pa=packet(h,{id:'usA',key:'live:usA'}),pb=packet(h,{id:'usB',key:'live:usB'});
  pending.usA(pa);assert.equal(await a,null);assert.equal(h.ctx.loadingLive,true);
  pending.usB(pb);assert.equal((await b).id,'usB');assert.deepEqual(h.calls.picks,['usB']);assert.equal(h.ctx.loadingLive,false);
});
test('a cached open interrupted by navigation cannot apply a shared view to a different quake',async()=>{
  let finish;const h=harness(()=>new Promise(resolve=>finish=resolve));h.ctx.liveSeqs.usTest=h.seq;
  const opening=h.run('openLive({id:"usTest"})'),result=packet(h);h.ctx.S={...h.seq,key:'other'};
  finish(result);assert.equal(await opening,null);
});

test('an older initial request for the same event cannot replace the selected grid cache',async()=>{
  const pending=[];const h=harness(()=>new Promise(resolve=>pending.push(resolve)));
  const first=h.run('openLive({id:"usNew"})'),second=h.run('openLive({id:"usNew"})');
  const older=packet(h,{id:'usNew',key:'live:usNew'}),newer=packet(h,{id:'usNew',key:'live:usNew'});
  older.shakemap={dlat:.1,version:'1'};newer.shakemap={dlat:.1,version:'2'};
  pending[1](newer);await second;pending[0](older);assert.equal(await first,null);
  assert.equal(h.ctx.D.shakemaps['live:usNew'],newer.shakemap);assert.equal(h.ctx.liveSeqs.usNew,newer.seq);
});
