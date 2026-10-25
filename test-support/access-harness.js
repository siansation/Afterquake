// Browser sharing and speech controls, with DOM/map/storage test doubles.
// These verify interactions and persistence, not visual layout or real Leaflet input.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const MODEL=require('../src/model.js');
const SHAKE=require('../src/shake.js');
const SCENARIO=require('../src/scenario.js');
const code=fs.readFileSync(path.join(__dirname,'../src/places.js'),'utf8');
const storageKey='afterquake.saved-checks.v1';

function harness({stored=null,blocked=false,access=false,speech=true,clipboard=null,href="https://afterquake.test/",hash="",globals={}}={}){
  const nodes=new Map(),storage=new Map(stored==null?[]:[[storageKey,stored]]);
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:id==='exposure'?'1440':id==='bld'?'local':'',textContent:'',innerHTML:'',disabled:false,
      focus(){this.focused=true},select(){this.selected=true},click(){return this.onclick&&this.onclick()},attributes:{},setAttribute(key,value){this.attributes[key]=value},classList:{toggle(){}}});
    return nodes.get(id);
  };
  const layer=()=>({items:[],addTo(){return this},clearLayers(){this.items=[]}});
  const L={layerGroup:layer,divIcon:options=>options,marker:(position,options)=>({position,options,
    bindPopup(html){this.popup=html;return this},addTo(target){target.items.push(this);return this}})};
  const seq={key:'example',t0:'2023-02-06T00:00:00Z',events:[[0,7.5,0,0],[.1,5.2,.1,.1],[1.5,5.8,.2,.2]]};
  const location={lat:0,lon:0,name:'Town A'},q=SHAKE.q([0,0],0,0,760,7,false);
  const f=MODEL.fit(seq.events,1),cp=SHAKE.compact(f);
  const ctx=vm.createContext({SCENARIO,SHAKE,MODEL,L,document:{querySelectorAll:()=>[]},SPOKEN:require('../src/spoken.js'),$:node,loc:location,S:seq,SEQ:[seq],
    G:{coast:[],version:1,processed:'2023-02-07'},EX:{},D:{fetchedAt:'2026-10-24T17:32:53.517Z'},
    cur:{f,cp,now:1,sp:{qv:q,thr:7,gv:{vs:760,mmi:6,liq:0,ls:null}},src:[0,0],calib:false,tol:.01,
      exposure:SCENARIO.exposure(SHAKE,f,cp,q,1440),p24:SHAKE.probQ(f,cp,q,0,1)},
    B:{towns:[['Town B',.1,.2]]},TOWNS:{towns:[['Town B',.1,.2]]},
    map:{panTo(position){this.position=position}},selectTab(){},
    gridAt:(lat,lon)=>Math.abs(lat)>5||Math.abs(lon)>5?null:{vs:lat===0&&lon===0?760:380,mmi:6,liq:.03,ls:null},
    km:(lat,lon)=>[lon*111.32,lat*110.57],R:v=>String(v),pct:p=>`${(p*100).toFixed(1)}%`,
    fmtDT:d=>d.toISOString(),fmtDate:d=>d.toISOString().slice(0,10),esc:s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    localStorage:{getItem(key){if(blocked)throw new Error('blocked');return storage.get(key)||null},
      setItem(key,value){if(blocked)throw new Error('blocked');storage.set(key,value)}}});
  const events={},synth={voices:[{name:'English voice',voiceURI:'en-voice',lang:'en-GB'},{name:'German voice',voiceURI:'de-voice',lang:'de-DE'}],calls:[],cancelled:0,listeners:{},
    getVoices(){return this.voices},speak(utterance){this.calls.push(utterance)},cancel(){this.cancelled++;this.calls.at(-1)?.onend?.()},addEventListener(name,fn){this.listeners[name]=fn}};
  Object.assign(ctx,{VIEW_STATE:require('../src/view-state.js'),SPOKEN:require('../src/spoken.js'),playing:false,tourOn:false,mode:'detail',POLL_MS:120000,replayTimeOverride:null,
    location:{href,hash},navigator:{clipboard},addEventListener(name,fn){events[name]=fn},
    setLoc(lat,lon,name){ctx.loc={lat,lon,name}},buildBuildingOptions(){},setTol(v){node('tol').value=v;ctx.cur.tol=+v},
    setAbsoluteReplayTime(time){ctx.replayTimeOverride=time;ctx.cur.nowDate=new Date(time);return false},
    pickSeq(i){ctx.S=ctx.SEQ[i]},openLive:async()=>null,endTour(){ctx.tourOn=false}});
  Object.assign(seq,{label:'Test earthquake',lat:0,lon:0,M:7.5,id:'usExample'});ctx.cur.nowDate=new Date(Date.parse(seq.t0)+864e5);ctx.cur.re=0;
  Object.assign(ctx.map,{getZoom:()=>8,setView(position){this.position=position},fitBounds(bounds){this.bounds=bounds}});
  L.latLngBounds=points=>({points,pad(){return this}});
  ctx.update=()=>{
    if(ctx.replayTimeOverride!=null)ctx.cur.now=(ctx.replayTimeOverride-Date.parse(ctx.S.t0))/864e5;
    ctx.cur.nowDate=new Date(Date.parse(ctx.S.t0)+ctx.cur.now*864e5);
    ctx.cur.exposure=SCENARIO.exposure(SHAKE,ctx.cur.f,ctx.cur.cp,ctx.cur.sp.qv,+node('exposure').value);
    ctx.cur.calib=false;ctx.cur.tol=+node('tol').value||ctx.cur.tol;
    if(access)vm.runInContext('updateSpokenSummary()',ctx);
  };
  if(speech){ctx.speechSynthesis=synth;ctx.SpeechSynthesisUtterance=class{constructor(text){this.text=text}}}
  Object.assign(ctx,globals);
  new vm.Script(code).runInContext(ctx);
  if(access)new vm.Script(fs.readFileSync(path.join(__dirname,'../src/access.js'),'utf8')).runInContext(ctx);
  return {ctx,node,storage,events,synth,run:source=>vm.runInContext(source,ctx),advance(now){
    const f=MODEL.fit(seq.events,now),cp=SHAKE.compact(f);
    Object.assign(ctx.cur,{now,nowDate:new Date(Date.parse(seq.t0)+now*864e5),f,cp,exposure:SCENARIO.exposure(SHAKE,f,cp,q,+node('exposure').value)});
  }};
}
module.exports={harness,storageKey};
