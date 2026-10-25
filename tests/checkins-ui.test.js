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
  const layer={clearLayers(){markers.length=0},removeLayer(marker){const i=markers.indexOf(marker);if(i>=0)markers.splice(i,1)}};
  const L={divIcon:options=>options,marker(position,options){
    const element={attributes:{},title:'',setAttribute(k,v){this.attributes[k]=v},focus(){this.focused=true}};
    return {position,options,element,open:false,events:{},on(name,fn){this.events[name]=fn;return this},bindPopup(html){this.html=html;return this},addTo(){markers.push(this);return this},
      setLatLng(p){this.position=p;return this},setIcon(icon){this.options.icon=icon;return this},
      setZIndexOffset(z){this.options.zIndexOffset=z;return this},setPopupContent(html){this.html=html;return this},
      getElement(){return element},openPopup(){this.open=true;this.events.popupopen?.();return this}};
  }};
  const ctx=vm.createContext({$:node,URL,URLSearchParams,Uint8Array,crypto:webcrypto,AbortController,setTimeout,clearTimeout,
    location:new URL(href),history:{replaceState(_state,_title,url){ctx.location=new URL(url,ctx.location.href)}},
    navigator:{clipboard:{async writeText(text){if(!clipboard)throw new Error('denied');copies.push(text)}}},
    localStorage:{getItem(k){if(blocked)throw new Error('blocked');return storage.get(k)||null},setItem(k,v){if(blocked)throw new Error('blocked');storage.set(k,v)},removeItem(k){if(blocked)throw new Error('blocked');storage.delete(k)}},
    fetch:(...args)=>backend.fetch(...args),document:{hidden:false,querySelectorAll:()=>[],addEventListener:(name,fn)=>events['document:'+name]=fn},
    addEventListener:(name,fn)=>events[name]=fn,setInterval:fn=>intervals.push(fn),
    S:{key:'example',lon:0},loc:{lat:1.123456,lon:2.123456,name:'Park'},mode:'detail',ciLayer:layer,RND:{checks:{}},PAL:{help:'red',good:'green'},
    L,map:{getZoom:()=>8,setView(position,zoom){this.position=position;this.zoom=zoom}},VIEW_STATE,SCENARIO,fmtDT:d=>d.toISOString(),ago:()=> 'just now',
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
  assert.equal(b.node('ciSetup').hidden,true);assert.equal(b.node('ciPosting').hidden,false);
  assert.ok(b.node('ciLocation').textContent.includes('Check your pin'));
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

test('demo reset clears the current view, rotates the invite and opens its QR without deleting posts',async()=>{
  const h=harness();await h.run('initCheckins()');h.run('ciSetGroup(ciRandom(16))');
  h.node('ciNote').value='Demo help request';await h.run('checkIn("help")');
  const oldGroup=h.run('ci.group'),owner=h.run('ci.owner'),before=h.backend.calls.length;
  let qrGroup,boardCount;h.ctx.openJoin=()=>{qrGroup=h.run('ci.group')};h.ctx.renderBoard=()=>{boardCount=h.run('ci.items.length')};
  await h.node('ciResetDemo').onclick();
  const group=h.run('ci.group');assert.notEqual(group,oldGroup);assert.match(group,/^[a-f0-9]{32}$/);
  assert.equal(h.run('ci.owner'),owner);assert.equal(h.run('ci.items.length'),0);assert.equal(h.markers.length,0);
  assert.equal(h.run('ci.payload.counts.total'),0);assert.match(h.node('ciSummary').textContent,/0 marked safe; 0 need help/);
  assert.equal(h.node('ciNote').value,'');assert.equal(qrGroup,group);assert.equal(boardCount,0);
  assert.equal(h.storage.get(keys.group),group);assert.equal(new URLSearchParams(h.ctx.location.hash.slice(1)).get('checkins'),group);
  assert.equal(VIEW_STATE.parse(h.ctx.location.hash).event.id,'example');assert.ok(!h.ctx.location.href.includes(owner));
  assert.equal(h.backend.records.size,1,'The old room must keep its own posts');
  assert.ok(h.backend.calls.slice(before).every(c=>c.options.method==='GET'));
  const reloaded=harness({backend:h.backend,stored:Object.fromEntries(h.storage),href:h.ctx.location.href});
  await reloaded.run('initCheckins()');assert.equal(reloaded.run('ci.group'),group);assert.equal(reloaded.run('ci.items.length'),0);
});

test('a late response from the previous demo cannot bring its people back',async()=>{
  const h=harness();await h.run('initCheckins()');h.run('ciSetGroup(ciRandom(16))');await h.run('checkIn("help")');
  const normal=h.backend.fetch.bind(h.backend);let finish;
  h.backend.fetch=()=>new Promise(resolve=>finish=resolve);const oldRead=h.run('refreshCheckins()');
  const oldItems=JSON.parse(h.run('JSON.stringify(ci.items)'));h.backend.fetch=normal;
  await h.node('ciResetDemo').onclick();
  finish({ok:true,json:async()=>({items:oldItems,counts:{total:1,safe:0,help:1},activity:[],limited:false,checkedAt:new Date().toISOString()})});
  await oldRead;assert.equal(h.run('ci.items.length'),0);assert.equal(h.markers.length,0);assert.equal(h.run('ci.payload.counts.total'),0);
});

test('demo reset is unavailable before joining and cannot interrupt a pending post',async()=>{
  const h=harness();await h.run('initCheckins()');assert.equal(h.node('ciResetDemo').disabled,true);
  h.run('ciSetGroup(ciRandom(16))');const group=h.run('ci.group');h.run('ci.busy=true;renderCheckins()');
  assert.equal(h.node('ciResetDemo').disabled,true);await h.node('ciResetDemo').onclick();assert.equal(h.run('ci.group'),group);
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

test('help flags and safe shields have labels, keyboard access and different display priority',async()=>{
  const h=harness();await h.run('initCheckins()');h.run('ciSetGroup(ciRandom(16))');
  await h.run('checkIn("help")');const marker=h.markers[0],helpPriority=marker.options.zIndexOffset;
  assert.equal(marker.options.pane,'checkins');assert.equal(marker.options.keyboard,true);
  assert.deepEqual(Array.from(marker.options.icon.iconSize),[44,44]);
  assert.match(marker.options.icon.html,/ci-symbol-help/);assert.match(marker.options.icon.html,/Needs help/);
  assert.match(marker.element.attributes['aria-label'],/check-in: needs help/);
  await h.run('checkIn("safe")');assert.equal(h.markers[0],marker);
  assert.match(marker.options.icon.html,/ci-symbol-safe/);assert.match(marker.options.icon.html,/>Safe</);
  assert.ok(helpPriority>marker.options.zIndexOffset);assert.match(marker.element.attributes['aria-label'],/marked safe/);
  assert.match(h.node('checkinKey').innerHTML,/Group check-ins/);
});

test('unchanged polls preserve an open check-in popup and help requests appear first',async()=>{
  const backend=service(),a=harness({backend}),b=harness({backend});await a.run('initCheckins()');await b.run('initCheckins()');
  a.run('ciSetGroup(ciRandom(16))');b.run('ciSetGroup('+JSON.stringify(a.run('ci.group'))+')');
  await a.run('checkIn("safe")');await b.run('checkIn("help")');await a.run('refreshCheckins()');
  assert.ok(a.node('ciList').innerHTML.indexOf('needs help')<a.node('ciList').innerHTML.indexOf('marked safe'));
  const marker=a.markers[0];marker.openPopup();marker.element.focus();
  await a.run('refreshCheckins()');assert.equal(a.markers[0],marker);assert.equal(marker.open,true);assert.equal(marker.element.focused,true);
});

test('Show reveals a hidden check-in, opens its note and focuses the correct wrapped location',async()=>{
  const h=harness();await h.run('initCheckins()');h.run('ciSetGroup(ciRandom(16))');
  h.ctx.S.lon=181;h.ctx.loc.lon=-179;h.node('ciNote').value='At the entrance';await h.run('checkIn("help")');
  const id=h.run('ci.items[0].id');h.node('showC').checked=false;h.run('renderCheckins()');
  assert.equal(h.markers.length,0);assert.equal(h.node('checkinKey').hidden,true);
  h.run('focusCheckin('+JSON.stringify(id)+')');
  assert.equal(h.node('showC').checked,true);assert.equal(h.markers.length,1);assert.equal(h.node('checkinKey').hidden,false);
  assert.equal(h.markers[0].open,true);assert.match(h.markers[0].html,/At the entrance/);assert.equal(h.markers[0].element.focused,true);
  assert.deepEqual(Array.from(h.ctx.map.position),[h.ctx.loc.lat,181]);
  for(const record of h.backend.records.values())record.expiresAt=new Date(Date.now()-1000).toISOString();
  await h.run('refreshCheckins()');assert.equal(h.markers.length,0,'Expired help requests must not stay on the map');
});
