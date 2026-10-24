// Browser controls for exposure duration, two-place comparison and saved checks.
// This file is inlined into the main UI script so it shares the existing map state.
let comparisonLocation=null, comparisonPicking=false;
const comparisonLayer=L.layerGroup().addTo(map);
const comparisonIcon=L.divIcon({className:'',iconSize:[26,36],iconAnchor:[13,35],popupAnchor:[0,-30],html:'<svg class="pin" viewBox="0 0 26 36" aria-hidden="true"><path d="M13 35C13 35 2 21 2 13a11 11 0 1 1 22 0c0 8-11 22-11 22z" fill="#0b5cad" stroke="#fff" stroke-width="2"/><text x="13" y="18" text-anchor="middle" fill="#fff" font-size="15" font-weight="800">B</text></svg>'});
const exposureLabel=()=>SCENARIO.durationLabel(+$('exposure').value);
const chance=SCENARIO.formatProbability;

function setComparisonPicking(active){
  comparisonPicking=active;
  $('pickComparison').setAttribute('aria-pressed',String(active));
  $('pickComparison').textContent=active?'Cancel choosing B':'Choose B on map';
  $('comparisonStatus').textContent=active?'Click inside the mapped area to place B. Your spot A stays where it is. Press Escape to cancel.':comparisonLocation?'B is shown in blue. Normal map clicks now move your spot A.':'Choose B on the map or search a town below. Your red pin is A.';
  $('map').classList.toggle('picking-comparison',active);
}
function resetComparison(){
  comparisonLocation=null;comparisonLayer.clearLayers();$('comparisonTown').value='';
  $('clearComparison').disabled=true;setComparisonPicking(false);
}
function chooseComparison(lat,lon,name){
  const gv=gridAt(lat,lon);
  if(!gv||!gv.vs){$('comparisonStatus').textContent='No ground data at this point. Choose B inside the modelled area.';return false}
  comparisonLocation={lat,lon,name};$('comparisonTown').value=name;
  $('clearComparison').disabled=false;setComparisonPicking(false);renderComparison();return true;
}
function coastDistance(lat,lon){
  const [x,y]=km(lat,lon);let coast=Infinity;
  for(const [ax,ay,bx,by] of G.coast){const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy||1;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/len));
    coast=Math.min(coast,Math.hypot(ax+t*dx-x,ay+t*dy-y))}
  return coast;
}
function renderComparison(){
  comparisonLayer.clearLayers();
  if(!comparisonLocation){$('comparisonResult').innerHTML='<p class="muted">Compare the same shaking intensity and time at two places. Neither pin is a verified shelter.</p>';return}
  const a=loc,b=comparisonLocation,bg=gridAt(b.lat,b.lon);
  if(!bg||!bg.vs){resetComparison();$('comparisonResult').textContent='The comparison point has no model data. Choose B again.';return}
  const [bx,by]=km(b.lat,b.lon);
  // Use A's effective intensity at BOTH pins. Applying separate building-country
  // heuristics would mix changing damage definitions with changing ground motion.
  const qb=SHAKE.q(cur.src,bx,by,bg.vs,cur.sp.thr,cur.calib);
  const eb=SCENARIO.exposure(SHAKE,cur.f,cur.cp,qb,cur.exposure.minutes),ea=cur.exposure;
  const ag=cur.sp.gv,range=e=>`${chance(e.range.low)}–${chance(e.range.high)}`;
  const fraction=v=>v==null?'No model data':pct(v)+' modelled';
  const coastText=p=>{const d=coastDistance(p.lat,p.lon);return Number.isFinite(d)?`${d<1?d.toFixed(1):Math.round(d)} km`:'Not resolved'};
  const rows=[
    [`Chance in ${exposureLabel()}`,chance(ea.probability),chance(eb.probability)],
    ['90% parameter range',range(ea),range(eb)],
    ['Next 24 hours',chance(cur.p24),chance(SHAKE.probQ(cur.f,cur.cp,qb,0,1))],
    ['Ground Vs30',`${Math.round(ag.vs)} m/s`,`${Math.round(bg.vs)} m/s`],
    ['Mainshock intensity',R(ag.mmi),R(bg.mmi)],
    ['Liquefaction extent',fraction(ag.liq),fraction(bg.liq)],
    ['Landslide extent',fraction(ag.ls),fraction(bg.ls)],
    ['Coast proximity',coastText(a),coastText(b)]
  ];
  const delta=eb.probability-ea.probability;
  const difference=chance(ea.probability)===chance(eb.probability)?'The exposure estimates are equal at the displayed precision.':`${delta<0?'B':'A'} has the lower modelled shaking estimate for this interval.`;
  $('comparisonResult').innerHTML=`<p class="p">${SCENARIO.distanceKm(a,b).toFixed(1)} km apart · intensity <b>${R(cur.sp.thr)}+</b> at both · same replay time.</p><table class="compare-table"><thead><tr><th scope="col">Measure</th><th scope="col">A: ${esc(a.name)}</th><th scope="col" class="comparison-b">B: ${esc(b.name)}</th></tr></thead><tbody>${rows.map(([k,v,w])=>`<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td><td>${esc(w)}</td></tr>`).join('')}</tbody></table><p class="p">${difference}</p><p class="muted">Shaking estimates cover M5+ aftershocks. Building, route and shelter safety need separate checks. Coast proximity is not a tsunami forecast.</p>`;
  L.marker([b.lat,b.lon],{icon:comparisonIcon,title:'Comparison B: '+b.name,keyboard:true})
    .bindPopup(`<div class="pp-h">B: ${esc(b.name)}</div>${chance(eb.probability)} chance of intensity ${R(cur.sp.thr)}+ shaking in ${exposureLabel()}.<br><span class="pp-k">Same intensity and replay time as A. Not shelter clearance.</span>`).addTo(comparisonLayer);
}
$('pickComparison').onclick=()=>{setComparisonPicking(!comparisonPicking);selectTab('spot')};
$('clearComparison').onclick=()=>{resetComparison();renderComparison()};
$('comparisonTown').onchange=()=>{const name=$('comparisonTown').value.trim().toLowerCase();
  const t=TOWNS.towns.find(t=>t[0].toLowerCase()===name)||B.towns.find(t=>t[0].toLowerCase()===name);
  if(t){if(chooseComparison(t[1],t[2],t[0]))map.panTo([t[1],t[2]])}
  else $('comparisonStatus').textContent='Choose a town from the suggestions, or use the map.'};

const CHECKS_KEY='afterquake.saved-checks.v1';
let savedChecks=Object.create(null),checkFeedback='';
try{
  const stored=JSON.parse(localStorage.getItem(CHECKS_KEY)||'{}');
  if(stored&&typeof stored==='object'&&!Array.isArray(stored)){
    for(const key of SEQ.map(s=>s.key))if(SCENARIO.validSnapshot(stored[key])&&stored[key].sequence===key)savedChecks[key]=stored[key];
  }
}catch(e){/* Storage may be blocked for a standalone file. Session-only checks still work. */}
function persistChecks(){
  try{localStorage.setItem(CHECKS_KEY,JSON.stringify(savedChecks));return true}catch(e){return false}
}
function currentCheck(){
  // Bump algorithm when the model's mathematical behaviour changes. Include fitted
  // parameters so a rebuilt snapshot cannot silently compare two different models.
  const modelVersion=JSON.stringify({algorithm:1,rate:MODEL.params,k:SHAKE.K,bias:SHAKE.BIAS,depth:SHAKE.H,kernel:SHAKE.KERNEL,maxMagnitude:SHAKE.MMAX});
  return SCENARIO.capture({sequence:S.key,location:loc,now:cur.now,minutes:cur.exposure.minutes,
    probability:cur.exposure.probability,q:cur.sp.qv,threshold:cur.sp.thr,
    building:$('bld').value,calibrated:cur.calib,tolerance:cur.tol,savedAt:Date.now(),
    dataVersion:D.fetchedAt,gridVersion:JSON.stringify([G.version,G.processed,(EX[S.key]||{}).gfInfo||null]),
    modelVersion,events:S.events});
}
function renderChanges(){
  const previous=savedChecks[S.key],current=currentCheck(),diff=SCENARIO.changes(previous,current);
  $('forgetCheck').disabled=!previous;$('changesFeedback').textContent=checkFeedback;
  if(diff.status==='missing'){
    $('changesResult').innerHTML='<p class="p">Save your spot A now, then move the replay timeline or change a setting to see what affected the estimate. Saved checks stay in this browser.</p>';return;
  }
  const savedDate=new Date(Date.parse(S.t0)+previous.now*864e5);
  const earlier=`${chance(previous.probability)} over ${SCENARIO.durationLabel(previous.minutes)}`;
  const latest=`${chance(current.probability)} over ${SCENARIO.durationLabel(current.minutes)}`;
  const summary=diff.status==='same'?'No inputs changed since your saved check.':`Saved estimate: ${earlier}. Current estimate: ${latest}.`;
  $('changesResult').innerHTML=`<p class="muted">Compared with ${esc(previous.location.name)} at ${fmtDT(savedDate)} in the replay.</p><p class="p">${summary}</p>${diff.assumptionsChanged?'<p class="muted">The location or settings changed, so these are different scenarios.</p>':''}${diff.reasons.length?`<ul class="changes-list">${diff.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>`:''}<p class="muted">Changes refer to this recorded replay and its inputs. This panel does not receive live alerts or local news.</p>`;
}
$('saveCheck').onclick=()=>{
  if(!cur.f)return;savedChecks[S.key]=currentCheck();
  checkFeedback=persistChecks()?'Check saved on this browser. Future comparisons use this replay moment.':'Check saved for this session. Browser storage is unavailable.';renderChanges();
};
$('forgetCheck').onclick=()=>{
  delete savedChecks[S.key];const persisted=persistChecks();
  checkFeedback=persisted?'Saved check removed.':'Removed for this session; browser storage is unavailable.';renderChanges();
};
