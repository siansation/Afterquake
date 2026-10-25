const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/story.js'),'utf8');
function harness({motion=false}={}){
  const nodes=new Map(),timers=[],calls={ask:0,speech:0,popups:0};let days=1;
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:id==='exposure'?'1440':'',hidden:true,disabled:false,innerHTML:'',textContent:'',attributes:{},
      classList:{values:new Set(),add(v){this.values.add(v)},remove(v){this.values.delete(v)}},
      setAttribute(k,v){this.attributes[k]=v},focus(){},scrollIntoView(){},click(){if(id==='readSummary')calls.speech++;return this.onclick?.()}});
    return nodes.get(id);
  };
  const ctx=vm.createContext({$:node,esc:s=>String(s),mode:'detail',S:{key:'turkey'},G:{bounds:{pad(){return this}}},loc:{name:'Town',lat:1,lon:1},playing:false,
    cur:{f:{},exposure:{minutes:1440,probability:.1},now:1},TIGER:{enabled:true,data:null},
    requestAnimationFrame:fn=>fn(),setTimeout:fn=>timers.push(fn),matchMedia:()=>({matches:!motion}),
    map:{invalidateSize(){},fitBounds(){},setView(){},closePopup(){}},globe:{resize(){}},
    L:{popup(){return{setLatLng(){return this},setContent(){return this},openOn(){calls.popups++;return this}}}},
    stopSummary(){},pausePlayback(){ctx.playing=false},resetChoices(){node('exposure').value='1440'},goSeq(){},setLayer(){},
    setDays(d){days=d;ctx.cur.now=d},selectedDays:()=>days,goTown(name){ctx.loc.name=name},
    selectTab(tab){ctx.tab=tab},setAskOpen(){},ask:async()=>{calls.ask++},liveNow(){},openJoin(){},
    tigerProbe:async()=>{},tigerFetch:async()=>{},renderTiger(){},
    chance:p=>`${p*100}%`,dur:d=>`${d} days`,exposureLabel:()=>`${node('exposure').value} minutes`,
    update(){ctx.cur.exposure.minutes=+node('exposure').value;vm.runInContext('updateTourEstimate()',ctx)},
    updateSpokenSummary(){node('readSummary').disabled=false}});
  vm.runInContext(source,ctx);return{ctx,node,calls,timers,run:s=>vm.runInContext(s,ctx)};
}
test('time controls change the actual visit length without changing the narrative time',async()=>{
  const h=harness();await h.run('tourOn=true;showStep(1)');
  assert.equal(h.ctx.cur.now,.3);
  await h.node('tShort').onclick();assert.equal(h.ctx.cur.exposure.minutes,10);
  await h.node('tLong').onclick();assert.equal(h.ctx.cur.exposure.minutes,1440);
  assert.equal(h.ctx.cur.now,.3);
  assert.equal(h.node('tLong').attributes['aria-pressed'],'true');
});
test('Gemini and voice are optional explicit actions within the place-and-time scene',async()=>{
  const h=harness();await h.run('tourOn=true;showStep(1)');
  assert.equal(h.calls.ask,0);assert.equal(h.calls.speech,0);
  await h.node('tAsk').onclick();await h.node('tSpeak').onclick();
  assert.equal(h.calls.ask,1);assert.equal(h.calls.speech,1);
});
test('exiting during the aftershock scene cancels the replay and prevents a late popup',async()=>{
  const h=harness({motion:true}),pending=h.run('tourOn=true;showStep(2)');
  assert.equal(h.node('tour').hidden,false);assert.equal(typeof h.node('tExit').onclick,'function');
  h.node('tExit').onclick();h.timers.shift()();await pending;
  assert.equal(h.node('tour').hidden,true);assert.equal(h.ctx.playing,false);
  assert.equal(h.ctx.cur.now,.3);assert.equal(h.calls.popups,0);
});
