// Invite-only, explicitly posted check-ins. Tokens stay in this browser; group
// invites contain only the group token, never the token that edits your entry.
const CI_KEYS={owner:'afterquake.checkins.owner.v1',group:'afterquake.checkins.group.v1'};
const ci={ready:false,connecting:false,group:null,owner:null,scope:null,items:[],payload:null,busy:false,request:null,sessionOnly:false,error:'',message:'',version:0};
const ciMarkers=new Map(),ciIcons=new Map();
function ciSymbol(status){
  const help=status==='help';
  return `<svg class="ci-symbol ci-symbol-${status}" viewBox="0 0 36 44" aria-hidden="true" focusable="false"><path d="${help?'M3 2h30v30H23l-5 10-5-10H3z':'M18 2l15 5v13c0 10-9 16-15 22C12 36 3 30 3 20V7z'}" fill="currentColor" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>${help?'<path d="M18 9v11" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="18" cy="26" r="2.2" fill="#fff"/>':'<path d="m10 19 6 6 11-13" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'}</svg>`;
}
function ciMarkerIcon(status){
  if(!ciIcons.has(status))ciIcons.set(status,L.divIcon({className:'ci-map-marker',iconSize:[44,44],iconAnchor:[22,43],popupAnchor:[0,-42],
    html:ciSymbol(status)+`<span class="ci-map-label">${status==='help'?'Needs help':'Safe'}</span>`}));
  return ciIcons.get(status);
}
function renderCheckinLegend(){
  const key=$('checkinKey');if(!key)return;
  const visible=ci.ready&&!!ci.group&&$('showC').checked;
  key.hidden=!visible;key.innerHTML=visible?`<b>Group check-ins</b><span>${ciSymbol('help')}Needs help</span><span>${ciSymbol('safe')}Safe</span>`:'';
}
function renderCheckinMarkers(items){
  const visible=S&&ci.ready&&ci.group&&$('showC').checked,ids=new Set(visible?items.map(d=>d.id):[]);
  for(const [id,entry] of ciMarkers)if(!ids.has(id)){ciLayer.removeLayer(entry.marker);ciMarkers.delete(id)}
  if(!visible)return;
  for(const d of items){
    const lon=d.lon+360*Math.round((S.lon-d.lon)/360),signature=JSON.stringify([d.status,d.lat,lon,d.mine,d.note,d.ts]);
    const previous=ciMarkers.get(d.id);if(previous?.signature===signature)continue;
    const title=`${d.mine?'Your':'Group'} check-in: ${d.status==='help'?'needs help':'marked safe'}. Open details.`;
    const popup=`<div class="pp-h">${d.mine?'You':'Someone'}: ${d.status==='help'?'needs help':'marked safe'}</div>${d.note?esc(d.note)+'<br>':''}<span class="pp-k">Group check-in, ${esc(fmtDT(new Date(d.ts)))}</span>`;
    // Keep help requests above safe check-ins, town labels and the forecast pin.
    // Reuse unchanged markers so polling doesn't interrupt a popup or keyboard focus.
    const priority=d.status==='help'?20000:10000;
    let marker=previous?.marker;
    if(marker)marker.setLatLng([d.lat,lon]).setIcon(ciMarkerIcon(d.status)).setZIndexOffset(priority).setPopupContent(popup);
    else marker=L.marker([d.lat,lon],{pane:'checkins',icon:ciMarkerIcon(d.status),title,keyboard:true,zIndexOffset:priority,riseOnHover:true,riseOffset:30000})
      .bindPopup(popup,{className:'ci-popup',maxWidth:260,autoPanPaddingTopLeft:[48,10],autoPanPaddingBottomRight:[10,100]})
      .on('popupopen',()=>$('map').classList.toggle('ci-popup-open',true))
      .on('popupclose',()=>$('map').classList.toggle('ci-popup-open',false)).addTo(ciLayer);
    marker.options.title=title;const element=marker.getElement();if(element){element.title=title;element.setAttribute('aria-label',title)}
    ciMarkers.set(d.id,{marker,signature});
  }
}
function focusCheckin(id){
  const d=ci.items.find(item=>item.id===id&&Date.parse(item.expiresAt)>Date.now());if(!d||!S)return;
  $('showC').checked=true;renderCheckins();
  map.setView([d.lat,d.lon+360*Math.round((S.lon-d.lon)/360)],Math.max(11,map.getZoom()));
  if(typeof matchMedia==='function'&&matchMedia('(max-width:860px)').matches)$('map').scrollIntoView({block:'end'});
  const marker=ciMarkers.get(id)?.marker;marker?.openPopup();marker?.getElement()?.focus({preventScroll:true});
}
function ciRandom(bytes){const data=new Uint8Array(bytes);crypto.getRandomValues(data);return [...data].map(n=>n.toString(16).padStart(2,'0')).join('')}
function ciRemember(key,value){try{if(value==null)localStorage.removeItem(key);else localStorage.setItem(key,value)}catch{ci.sessionOnly=true}}
function ciStored(key){try{return localStorage.getItem(key)}catch{ci.sessionOnly=true;return null}}
function ciContext(){return S&&ci.group&&ci.owner?{group:ci.group,owner:ci.owner,sequence:S.key,key:`${ci.group}:${S.key}`}:null}
function ciCurrent(context){return ciContext()?.key===context.key}
function ciSetGroup(group){ci.version++;ci.request?.abort();ci.group=group;ci.items=[];ci.payload=null;ci.error='';ci.message='';ciRemember(CI_KEYS.group,group);$('ciInviteBox').hidden=true;renderCheckins()}
function ciParseGroup(value){
  const text=value.trim().toLowerCase();if(/^[a-f0-9]{32}$/.test(text))return text;
  try{const url=new URL(value.trim());if(!['https:','http:'].includes(url.protocol))throw new Error();const group=new URLSearchParams(url.hash.slice(1)).get('checkins');if(/^[a-f0-9]{32}$/.test(group||''))return group}catch{}
  throw new Error('Use a group invite link or its 32-character code.');
}
function ciReadInvite(){
  const params=new URLSearchParams(location.hash.slice(1));if(!params.has('checkins'))return;
  try{ciSetGroup(ciParseGroup(params.get('checkins')))}catch(e){ci.error=e.message;renderCheckins()}
}
async function ciFetch(method,context,body,signal){
  const response=await fetch('/api/checkins?sequence='+encodeURIComponent(context.sequence),{method,signal,cache:'no-store',
    headers:{Authorization:'Bearer '+context.group,'X-Checkin-Owner':context.owner,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(result?.error||'Shared check-ins are unavailable on this copy of the app.');
  if(!result)throw new Error('The check-in service returned an unreadable response.');return result;
}
function ciValidPayload(p){
  return p&&Array.isArray(p.items)&&p.items.length<=200&&p.counts&&['total','safe','help'].every(k=>Number.isInteger(p.counts[k])&&p.counts[k]>=0)
    &&p.counts.total===p.counts.safe+p.counts.help&&p.items.length<=p.counts.total&&typeof p.limited==='boolean'
    &&Number.isFinite(Date.parse(p.checkedAt))&&Array.isArray(p.activity)&&p.activity.length<=25
    &&p.items.every(d=>typeof d.id==='string'&&/^[a-f0-9-]{36}$/i.test(d.id)&&['safe','help'].includes(d.status)&&typeof d.mine==='boolean'
      &&Number.isFinite(d.lat)&&Math.abs(d.lat)<=90&&Number.isFinite(d.lon)&&Math.abs(d.lon)<=180&&Number.isFinite(d.ts)
      &&typeof d.note==='string'&&d.note.length<=80&&Number.isFinite(Date.parse(d.expiresAt)))
    &&p.activity.every(d=>Number.isFinite(Date.parse(d.hour))&&Number.isInteger(d.safe)&&d.safe>=0&&Number.isInteger(d.help)&&d.help>=0);
}
async function refreshCheckins(){
  const context=ciContext();
  if(ci.scope!==context?.key){ci.scope=context?.key;ci.items=[];ci.payload=null;ci.error='';ci.message=''}
  renderCheckins();if(!ci.ready||!context)return;
  // New navigation cancels the old read. Its response cannot populate another
  // earthquake or another group, even when requests finish out of order.
  ci.request?.abort();const request=ci.request=new AbortController(),version=++ci.version;
  const timer=setTimeout(()=>request.abort(),15000);
  try{
    const result=await ciFetch('GET',context,null,request.signal);
    if(!ciValidPayload(result))throw new Error('The check-in service returned invalid data.');
    if(version!==ci.version||!ciCurrent(context))return;
    ci.payload=result;ci.items=result.items;ci.error='';
  }catch(e){if(version===ci.version&&ciCurrent(context))ci.error=e.name==='AbortError'?'Check-in updates timed out. Showing the last confirmed posts.':e.message}
  finally{clearTimeout(timer);if(version===ci.version){ci.request=null;renderCheckins()}}
}
async function initCheckins(){
  if(ci.connecting)return;ci.connecting=true;renderCheckins();
  try{
    if(typeof crypto==='undefined'||typeof crypto.getRandomValues!=='function')throw new Error('This browser cannot create a secure check-in identity. Open the hosted app in a current browser.');
    ci.owner=ci.owner||ciStored(CI_KEYS.owner);if(!/^[a-f0-9]{64}$/.test(ci.owner||'')){ci.owner=ciRandom(32);ciRemember(CI_KEYS.owner,ci.owner)}
    const remembered=ciStored(CI_KEYS.group);if(/^[a-f0-9]{32}$/.test(remembered||''))ci.group=remembered;
    ciReadInvite();
    if(!['http:','https:'].includes(location.protocol))throw new Error('Open the hosted app to use shared check-ins.');
    const request=new AbortController(),timer=setTimeout(()=>request.abort(),10000);
    let response,config;try{response=await fetch('/api/checkins',{cache:'no-store',signal:request.signal});config=await response.json().catch(()=>null)}finally{clearTimeout(timer)}
    if(!response.ok||!config?.configured)throw new Error('Shared check-ins are not available on this server yet.');
    ci.ready=true;await refreshCheckins();
  }catch(e){ci.error=e.name==='AbortError'?'Could not reach the check-in service. Try connecting again.':e.message}
  finally{ci.connecting=false;renderCheckins()}
}
function renderCheckinLocation(){if(loc)$('ciLocation').textContent=`Posting at ${loc.name}. Check your pin on the map before sharing.`}
function renderCheckins(){
  const joined=ci.ready&&!!ci.group;
  $('ciSetup').hidden=joined;$('ciPosting').hidden=!joined;$('ciGroupOptions').hidden=!ci.group;renderCheckinLocation();
  $('ciCreate').disabled=!ci.ready||ci.busy;$('ciJoin').disabled=!ci.ready||ci.busy;
  $('ciCopy').disabled=!joined||ci.busy;$('ciLeave').disabled=!ci.group||ci.busy;
  $('ciResetDemo').disabled=!joined||ci.busy;
  $('ciReconnect').hidden=ci.ready;$('ciReconnect').disabled=ci.connecting;$('ciRefresh').disabled=!joined||ci.busy;
  $('ciSafe').disabled=!joined||ci.busy;$('ciHelp').disabled=!joined||ci.busy;$('ciNote').disabled=!joined||ci.busy;
  const items=ci.items.filter(d=>Date.parse(d.expiresAt)>Date.now()).sort((a,b)=>Number(b.status==='help')-Number(a.status==='help')||b.ts-a.ts);
  renderCheckinMarkers(items);renderCheckinLegend();
  $('ciDel').disabled=!joined||ci.busy||!items.some(d=>d.mine);
  const storage=ci.sessionOnly?' Browser storage is blocked, so you can edit your entry only during this visit.':'';
  const checked=ci.payload?` Last checked ${fmtDT(new Date(ci.payload.checkedAt))}.`:'';
  $('ciStatus').textContent=(ci.error||ci.message||(joined?'Showing current check-ins for your group.':ci.ready?'Create or join a group to share your status.':'Connecting to shared check-ins...'))+checked+storage;
  $('ciStatus').classList.toggle('data-delayed',!!ci.error);
  $('ciSummary').textContent=joined&&ci.payload?`${ci.payload.counts.safe} marked safe; ${ci.payload.counts.help} need help.${ci.payload.limited?' Showing up to 200 recent posts, including yours.':''}`:'';
  if(!joined){$('ciList').innerHTML='';$('ciActivity').innerHTML='';return}
  $('ciList').innerHTML=items.length?items.map(d=>`<div class="ci">${ciSymbol(d.status)}<span><b>${d.mine?'You':'Someone'}</b>: ${d.status==='help'?'needs help':'marked safe'}${d.note?'. '+esc(d.note):''}<br><small>${esc(ago(Math.max(0,Date.now()-d.ts)))}${loc?', '+SCENARIO.distanceKm(loc,d).toFixed(1)+' km from your pin':''}</small></span><button class="src" data-ci-id="${esc(d.id)}">Show</button></div>`).join(''):'<p class="muted">No current check-ins for this earthquake in your group.</p>';
  document.querySelectorAll('#ciList button[data-ci-id]').forEach(button=>{button.onclick=()=>focusCheckin(button.dataset.ciId)});
  $('ciActivity').innerHTML=ci.payload?.activity.length?'<p class="muted">Status updates in the last 24 hours. Repeat updates count again; these are not counts of people.</p><table><tr><th>Hour (UTC)</th><th class="num">Safe</th><th class="num">Need help</th></tr>'+ci.payload.activity.map(d=>`<tr><td>${esc(fmtDT(new Date(d.hour)))}</td><td class="num">${d.safe}</td><td class="num">${d.help}</td></tr>`).join('')+'</table>':'<p class="muted">No status updates in the last 24 hours.</p>';
}
async function checkIn(status){
  const context=ciContext();if(!ci.ready||!context||ci.busy||!loc)return;
  ci.busy=true;ci.error='';ci.message=status==='remove'?'Removing your check-in...':'Saving your check-in...';renderCheckins();
  const request=new AbortController(),timer=setTimeout(()=>request.abort(),15000);
  try{
    const lon=((loc.lon+540)%360)-180;
    await ciFetch(status==='remove'?'DELETE':'PUT',context,status==='remove'?null:{sequence:context.sequence,status,lat:loc.lat,lon,note:$('ciNote').value.trim()},request.signal);
    if(ciCurrent(context)){ci.message=status==='remove'?'Your check-in and its update history were removed.':status==='help'?'Your group can now see that you need help at the selected pin. This does not contact emergency services.':'Your group can now see that you marked yourself safe at the selected pin.';await refreshCheckins()}
  }catch(e){if(ciCurrent(context))ci.error=e.name==='AbortError'?'Your change was not confirmed. Refresh to check before trying again.':e.message}
  finally{clearTimeout(timer);ci.busy=false;renderCheckins()}
}
async function startFreshDemo(){
  if(!ci.ready||!ci.group||ci.busy||!S)return;
  const sequence=S;let group;
  ci.busy=true;
  try{
    group=ciRandom(16);
    const url=new URL(VIEW_STATE.url(location.href,currentView())),params=new URLSearchParams(url.hash.slice(1));
    params.set('checkins',group);url.hash=params.toString();
    // Rotate the invite instead of deleting other people's posts. Updating both
    // storage and the URL prevents a reload or delayed read restoring the old room.
    ciSetGroup(group);history.replaceState(null,'',url.href);
    $('ciNote').value='';$('ciGroupInput').value='';$('ciInviteURL').value=url.href;
    if(typeof renderBoard==='function')renderBoard();
    await refreshCheckins();
    if(ci.group!==group||S!==sequence)return;
    ci.message='Fresh demo started. Share the new invite or QR code so everyone joins this group.';
    if(typeof openJoin==='function')openJoin();
  }catch{ci.error='Could not start a fresh demo. Try again.'}
  finally{ci.busy=false;renderCheckins()}
}
$('ciCreate').onclick=()=>{try{ciSetGroup(ciRandom(16));refreshCheckins()}catch{ci.error='This browser cannot create a secure group code.';renderCheckins()}};
$('ciResetDemo').onclick=startFreshDemo;
$('ciJoin').onclick=()=>{try{ciSetGroup(ciParseGroup($('ciGroupInput').value));$('ciGroupInput').value='';refreshCheckins()}catch(e){ci.error=e.message;renderCheckins()}};
$('ciLeave').onclick=()=>{
  ciSetGroup(null);const params=new URLSearchParams(location.hash.slice(1));params.delete('checkins');
  history.replaceState(null,'',location.pathname+location.search+(params.size?'#'+params:''));
  ci.message='Group left. Previously shared posts remain until you rejoin to remove them or they expire.';renderCheckins();
};
$('ciCopy').onclick=async()=>{
  try{
    const url=new URL(VIEW_STATE.url(location.href,currentView())),params=new URLSearchParams(url.hash.slice(1));params.set('checkins',ci.group);url.hash=params.toString();
    $('ciInviteURL').value=url.href;$('ciInviteBox').hidden=false;
    try{await navigator.clipboard.writeText(url.href);ci.message='Group invite copied. Anyone with this link can see and join the group.'}
    catch{$('ciInviteURL').focus();$('ciInviteURL').select();ci.message='Copy the selected group invite. Anyone with it can see and join the group.'}
    ci.error='';renderCheckins();
  }catch(e){ci.error=e.message;renderCheckins()}
};
$('ciSafe').onclick=()=>checkIn('safe');$('ciHelp').onclick=()=>checkIn('help');$('ciDel').onclick=()=>checkIn('remove');
$('ciRefresh').onclick=()=>refreshCheckins();$('ciReconnect').onclick=()=>initCheckins();
addEventListener('hashchange',()=>{ciReadInvite();refreshCheckins()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mode==='detail')refreshCheckins()});
setInterval(()=>{if(!document.hidden&&mode==='detail')refreshCheckins()},15000);
