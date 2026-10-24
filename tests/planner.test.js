// Unit checks for browser controller behaviour with DOM/map/storage test doubles.
// These verify interactions and persistence, not visual layout or real Leaflet input.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const MODEL=require('../src/model.js');
const SHAKE=require('../src/shake.js');
const SCENARIO=require('../src/scenario.js');
const code=fs.readFileSync(path.join(__dirname,'../src/planner.js'),'utf8');
const storageKey='afterquake.saved-checks.v1';

function harness({stored=null,blocked=false}={}){
  const nodes=new Map(),storage=new Map(stored==null?[]:[[storageKey,stored]]);
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:id==='exposure'?'1440':id==='bld'?'local':'',textContent:'',innerHTML:'',disabled:false,
      attributes:{},setAttribute(key,value){this.attributes[key]=value},classList:{toggle(){}}});
    return nodes.get(id);
  };
  const layer=()=>({items:[],addTo(){return this},clearLayers(){this.items=[]}});
  const L={layerGroup:layer,divIcon:options=>options,marker:(position,options)=>({position,options,
    bindPopup(html){this.popup=html;return this},addTo(target){target.items.push(this);return this}})};
  const seq={key:'example',t0:'2023-02-06T00:00:00Z',events:[[0,7.5,0,0],[.1,5.2,.1,.1],[1.5,5.8,.2,.2]]};
  const location={lat:0,lon:0,name:'Town A'},q=SHAKE.q([0,0],0,0,760,7,false);
  const f=MODEL.fit(seq.events,1),cp=SHAKE.compact(f);
  const ctx=vm.createContext({SCENARIO,SHAKE,MODEL,L,$:node,loc:location,S:seq,SEQ:[seq],
    G:{coast:[],version:1,processed:'2023-02-07'},EX:{},D:{fetchedAt:'2026-10-24T17:32:53.517Z'},
    cur:{f,cp,now:1,sp:{qv:q,thr:7,gv:{vs:760,mmi:6,liq:0,ls:null}},src:[0,0],calib:false,tol:.01,
      exposure:SCENARIO.exposure(SHAKE,f,cp,q,1440),p24:SHAKE.probQ(f,cp,q,0,1)},
    B:{towns:[['Town B',.1,.2]]},TOWNS:{towns:[['Town B',.1,.2]]},
    map:{panTo(position){this.position=position}},selectTab(){},
    gridAt:(lat,lon)=>Math.abs(lat)>5||Math.abs(lon)>5?null:{vs:lat===0&&lon===0?760:380,mmi:6,liq:.03,ls:null},
    km:(lat,lon)=>[lon*111.32,lat*110.57],R:v=>String(v),pct:p=>`${(p*100).toFixed(1)}%`,
    fmtDT:d=>d.toISOString(),esc:s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    localStorage:{getItem(key){if(blocked)throw new Error('blocked');return storage.get(key)||null},
      setItem(key,value){if(blocked)throw new Error('blocked');storage.set(key,value)}}});
  new vm.Script(code).runInContext(ctx);
  return {ctx,node,storage,run:source=>vm.runInContext(source,ctx),advance(now){
    const f=MODEL.fit(seq.events,now),cp=SHAKE.compact(f);
    Object.assign(ctx.cur,{now,f,cp,exposure:SCENARIO.exposure(SHAKE,f,cp,q,+node('exposure').value)});
  }};
}

test('choosing comparison B leaves A fixed and compares the same intensity and duration',()=>{
  const h=harness();h.node('pickComparison').onclick();
  assert.equal(h.node('pickComparison').attributes['aria-pressed'],'true');
  assert.equal(h.run('chooseComparison(.1,.2,"Town B")'),true);
  assert.equal(h.ctx.loc.name,'Town A');assert.equal(h.ctx.loc.lat,0);assert.equal(h.ctx.loc.lon,0);
  assert.equal(h.node('pickComparison').attributes['aria-pressed'],'false');
  assert.equal(h.run('comparisonLayer.items.length'),1);
  const qb=SHAKE.q([0,0],.2*111.32,.1*110.57,380,7,false);
  const expected=SCENARIO.formatProbability(SHAKE.probQ(h.ctx.cur.f,h.ctx.cur.cp,qb,0,1));
  const html=h.node('comparisonResult').innerHTML;
  assert.ok(html.includes('A: Town A')&&html.includes('B: Town B'));
  assert.ok(html.includes('7+</b> at both'));
  assert.ok(html.includes(`<td>${expected}</td>`));
});

test('comparison town search, cancellation and clearing use independent controls',()=>{
  const h=harness();h.node('comparisonTown').value='Town B';h.node('comparisonTown').onchange();
  assert.equal(h.run('comparisonLocation.name'),'Town B');
  assert.equal(h.ctx.loc.name,'Town A');
  h.node('pickComparison').onclick();h.node('pickComparison').onclick();
  assert.equal(h.run('comparisonPicking'),false);
  h.node('clearComparison').onclick();
  assert.equal(h.run('comparisonLocation'),null);assert.equal(h.run('comparisonLayer.items.length'),0);
  assert.equal(h.node('clearComparison').disabled,true);
});

test('comparison selection rejects unavailable grid data',()=>{
  const h=harness();assert.equal(h.run('chooseComparison(30,30,"Outside")'),false);
  assert.equal(h.run('comparisonLocation'),null);
  assert.ok(h.node('comparisonStatus').textContent.includes('No ground data'));
});

test('saving, comparing and reloading a check preserve the original replay baseline',()=>{
  const h=harness();h.node('saveCheck').onclick();
  const saved=h.storage.get(storageKey),record=JSON.parse(saved).example;
  assert.equal(record.now,1);assert.equal(record.events.length,2);
  assert.ok(h.node('changesFeedback').textContent.includes('saved on this browser'));
  h.advance(2);h.run('renderChanges()');
  assert.ok(h.node('changesResult').innerHTML.includes('additional catalogue event'));
  assert.equal(JSON.parse(h.storage.get(storageKey)).example.now,1,'Rendering must not overwrite the baseline');
  const reloaded=harness({stored:saved});reloaded.advance(2);reloaded.run('renderChanges()');
  assert.ok(reloaded.node('changesResult').innerHTML.includes('largest M5.8'));
  reloaded.node('forgetCheck').onclick();
  assert.equal(JSON.parse(reloaded.storage.get(storageKey)).example,undefined);
  assert.equal(reloaded.node('forgetCheck').disabled,true);
});

test('blocked storage falls back to session-only checks without crashing',()=>{
  const h=harness({blocked:true});h.node('saveCheck').onclick();
  assert.ok(h.node('changesFeedback').textContent.includes('this session'));
  h.advance(2);h.run('renderChanges()');
  assert.ok(h.node('changesResult').innerHTML.includes('additional catalogue event'));
  h.node('forgetCheck').onclick();assert.equal(h.node('forgetCheck').disabled,true);
});

test('corrupted persisted records reset rather than entering the comparison',()=>{
  for(const stored of ['not JSON','null','{"example":{"version":99}}']){
    const h=harness({stored});h.run('renderChanges()');
    assert.equal(h.node('forgetCheck').disabled,true);
    assert.ok(h.node('changesResult').innerHTML.includes('Save your spot A'));
  }
});

test('place names are escaped in comparison HTML and saved-check summaries',()=>{
  const h=harness(),unsafe='<img src=x onerror=alert(1)>';
  h.ctx.unsafeName=unsafe;h.run('chooseComparison(.1,.2,unsafeName)');
  assert.ok(!h.node('comparisonResult').innerHTML.includes(unsafe));
  assert.ok(h.node('comparisonResult').innerHTML.includes('&lt;img'));
  h.ctx.loc.name=unsafe;h.node('saveCheck').onclick();h.advance(2);h.run('renderChanges()');
  assert.ok(!h.node('changesResult').innerHTML.includes(unsafe));
  assert.ok(h.node('changesResult').innerHTML.includes('&lt;img'));
});
