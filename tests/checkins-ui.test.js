const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto,randomUUID}=require('node:crypto');
const VIEW_STATE=require('../src/view-state');
const SCENARIO=require('../src/scenario');
const source=fs.readFileSync(require.resolve('../src/checkins.js'),'utf8');
const keys={owner:'afterquake.checkins.owner.v1',group:'afterquake.checkins.group.v1'};
function service(){
  const records=new Map(),calls=[];
  return {records,calls,configured:true,failReads:false,
    async fetch(url,options={}){
      calls.push({url,options});const headers=options.headers||{},group=headers.Authorization?.slice(7),owner=headers['X-Checkin-Owner'];
      if(!group)return {ok:true,json:async()=>({configured:this.configured})};
      const sequence=new URL(url,'https://example.test').searchParams.get('sequence'),key=`${group}:${sequence}:${owner}`;
      if(options.method==='PUT'){
        const body=JSON.parse(options.body);records.set(key,{...body,id:records.get(key)?.id||randomUUID(),group,owner,ts:Date.now(),expiresAt:new Date(Date.now()+864e5).toISOString()});
        return {ok:true,json:async()=>({ok:true})};
      }
      if(options.method==='DELETE'){records.delete(key);return {ok:true,json:async()=>({ok:true})}}
      if(this.failReads)return {ok:false,json:async()=>({error:'Connection interrupted'})};
      const items=[...records.values()].filter(d=>d.group===group&&d.sequence===sequence).map(({group,owner:who,...d})=>({...d,mine:who===owner}));
      return {ok:true,json:async()=>({items,counts:{total:items.length,safe:items.filter(d=>d.status==='safe').length,help:items.filter(d=>d.status==='help').length},activity:[],limited:false,checkedAt:new Date().toISOString()})};
    }};
}
function harness({backend=service(),stored={},blocked=false,href='https://afterquake.test/',clipboard=true}={}){
  const nodes=new Map(),storage=new Map(Object.entries(stored)),events={},intervals=[],markers=[],copies=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,checked:true,
    classList:{toggle(){}},focus(){this.focused=true},select(){this.selected=true}});return nodes.get(id)};
  const layer={clearLayers(){markers.length=0}};
  const ctx=vm.createContext({$:node,URL,URLSearchParams,Uint8Array,crypto:webcrypto,AbortController,setTimeout,clearTimeout,
    location:new URL(href),history:{replaceState(_state,_title,url){ctx.location=new URL(url,ctx.location.href)}},
    navigator:{clipboard:{async writeText(text){if(!clipboard)throw new Error('denied');copies.push(text)}}},
    localStorage:{getItem(k){if(blocked)throw new Error('blocked');return storage.get(k)||null},setItem(k,v){if(blocked)throw new Error('blocked');storage.set(k,v)},removeItem(k){if(blocked)throw new Error('blocked');storage.delete(k)}},
    fetch:(...args)=>backend.fetch(...args),document:{hidden:false,querySelectorAll:()=>[],addEventListener:(name,fn)=>events['document:'+name]=fn},
    addEventListener:(name,fn)=>events[name]=fn,setInterval:fn=>intervals.push(fn),
    S:{key:'example',lon:0},loc:{lat:1.123456,lon:2.123456,name:'Park'},mode:'detail',ciLayer:layer,RND:{checks:{}},PAL:{help:'red',good:'green'},
    L:{circleMarker(position){return {bindPopup(html){this.html=html;return this},addTo(){markers.push({position,html:this.html});return this}}}},
    map:{setView(){}},VIEW_STATE,SCENARIO,fmtDT:d=>d.toISOString(),ago:()=> 'just now',
    esc:s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    currentView:()=>({v:1,event:{kind:'case',id:'example'},a:ctx.loc,b:null,minutes:10,building:'7',tolerance:.01,calibrated:false,at:'2026-10-25T12:00:00Z',dataAt:'2026-10-25'})});
  new vm.Script(source).runInContext(ctx);
  return {ctx,node,storage,events,intervals,markers,copies,backend,run:s=>vm.runInContext(s,ctx)};
}

test('unconfigured and standalone copies cannot pretend to save shared check-ins',async()=>{
  const backend=service();backend.configured=false;const h=harness({backend});await h.run('initCheckins()');
  assert.equal(h.node('ciSafe').disabled,true);assert.equal(h.node('ciCreate').disabled,true);assert.ok(h.node('ciStatus').textContent.includes('not available'));
  const file=harness({href:'file:///local/index.html'});await file.run('initCheckins()');assert.equal(file.backend.calls.length,0);assert.ok(file.node('ciStatus').textContent.includes('hosted app'));
});
test('two browsers join the same group, share statuses and remove only their own entry',async()=>{
  const backend=service(),a=harness({backend}),b=harness({backend});await a.run('initCheckins()');await b.run('initCheckins()');
  a.run('ciSetGroup(ciRandom(16))');await a.run('refreshCheckins()');const group=a.run('ci.group');
  b.node('ciGroupInput').value=group;await b.node('ciJoin').onclick();
  // The click handler starts a read without returning its promise; complete one explicitly.
  await b.run('refreshCheckins()');
  assert.notEqual(a.run('ci.owner'),b.run('ci.owner'));assert.equal(b.run('ci.group'),group);
  a.node('ciNote').value='<img src=x onerror=alert(1)>';await a.run('checkIn("safe")');await b.run('checkIn("help")');await a.run('refreshCheckins()');
  assert.equal(a.run('ci.items.length'),2);assert.equal(a.run('ci.items.filter(d=>d.mine).length'),1);
  assert.ok(a.node('ciList').innerHTML.includes('&lt;img'));assert.ok(!a.node('ciList').innerHTML.includes('<img'));
  assert.ok(a.node('ciSummary').textContent.includes('1 marked safe; 1 need help'));
  await a.run('checkIn("remove")');await b.run('refreshCheckins()');assert.equal(b.run('ci.items.length'),1);assert.equal(b.run('ci.items[0].mine'),true);
});
test('group invites preserve the map view but never include the owner credential',async()=>{
  const h=harness();await h.run('initCheckins()');h.run('ciSetGroup(ciRandom(16))');await h.run('refreshCheckins()');await h.node('ciCopy').onclick();
  const link=h.copies[0],params=new URLSearchParams(new URL(link).hash.slice(1));
  assert.equal(params.get('checkins'),h.run('ci.group'));assert.ok(params.has('view'));assert.ok(!link.includes(h.run('ci.owner')));
  const other=harness({href:link,backend:h.backend});await other.run('initCheckins()');assert.equal(other.run('ci.group'),h.run('ci.group'));
});
test('clipboard denial falls back to manual copying and leaving removes the invite from this URL',async()=>{
  const group='a'.repeat(32),h=harness({clipboard:false,href:'https://afterquake.test/#checkins='+group});await h.run('initCheckins()');await h.node('ciCopy').onclick();
  assert.equal(h.node('ciInviteBox').hidden,false);assert.equal(h.node('ciInviteURL').selected,true);
  h.node('ciLeave').onclick();assert.equal(h.run('ci.group'),null);assert.ok(!h.ctx.location.hash.includes('checkins'));assert.equal(h.storage.has(keys.group),false);
});
test('blocked storage retains the same editing identity during this visit and warns clearly',async()=>{
  const h=harness({blocked:true});await h.run('initCheckins()');const owner=h.run('ci.owner');await h.run('initCheckins()');
  assert.equal(h.run('ci.owner'),owner);assert.ok(h.node('ciStatus').textContent.includes('only during this visit'));
});
test('earthquake navigation clears old markers immediately and ignores an out-of-order read',async()=>{
  const h=harness();await h.run('initCheckins()');h.run('ciSetGroup(ciRandom(16))');await h.run('checkIn("safe")');assert.equal(h.markers.length,1);
  const normal=h.backend.fetch.bind(h.backend);let finish;h.backend.fetch=()=>new Promise(resolve=>finish=resolve);
  const pending=h.run('refreshCheckins()');h.ctx.S={key:'other',lon:0};h.backend.fetch=normal;await h.run('refreshCheckins()');
  assert.equal(h.markers.length,0);finish({ok:true,json:async()=>({items:[],counts:{total:999,safe:999,help:0},activity:[],checkedAt:new Date().toISOString()})});await pending;
  assert.equal(h.run('ci.payload.counts.total'),0);
});
test('failed refreshes preserve confirmed posts and hidden pages do not poll',async()=>{
  const h=harness();await h.run('initCheckins()');h.run('ciSetGroup(ciRandom(16))');await h.run('checkIn("safe")');h.backend.failReads=true;
  await h.run('refreshCheckins()');assert.equal(h.run('ci.items.length'),1);assert.ok(h.node('ciStatus').textContent.includes('Connection interrupted'));
  h.ctx.document.hidden=true;const before=h.backend.calls.length;h.intervals[0]();assert.equal(h.backend.calls.length,before);
});
