// Live moment for presenting: jump to the most significant real earthquake of the past
// week, and let the room join a check-in group from their phones with a QR code.
// Relies on page globals: feed, feedAt, pollFeed, enterWorld, focusItem, openItem, SEQ,
// pickSeq, selectTab, tourOn, endTour, ci, ciSetGroup, ciRandom, refreshCheckins,
// VIEW_STATE, currentView, mode, esc, fmtDT, ago, $.
const HOSTED_ORIGIN='https://afterquake-one.vercel.app/';
const LM={timer:null,fastUntil:0,lastCount:-1};

// Rank recent quakes that have a USGS ShakeMap. An active aftershock sequence beats a single
// bigger quake: count M4.5+ quakes within 250 km over the past week, then prefer the larger
// mainshock, the higher PAGER alert and the newer event. ?live=<USGS id> pins a specific quake.
// Deep quakes are skipped: the aftershock and shaking models assume shallow crustal sequences.
function kmBetween(a,b){const r=Math.PI/180,x=(b.lon-a.lon)*r*Math.cos((a.lat+b.lat)/2*r),y=(b.lat-a.lat)*r;return 6371*Math.hypot(x,y)}
function liveCandidates(days=7){
  if(!feed)return [];
  const cut=Date.now()-days*864e5,alert={red:3,orange:2,yellow:1,green:0};
  const recent=feed.quakes.filter(q=>q.t>=cut);
  const pinned=new URLSearchParams(location.search).get('live');
  const pool=recent.filter(q=>q.shakemap&&!(q.depth>70)).map(q=>({q,activity:recent.filter(o=>kmBetween(q,o)<=250).length}));
  return pool.sort((a,b)=>((b.q.id===pinned)-(a.q.id===pinned))||(b.activity-a.activity)||(b.q.M-a.q.M)||((alert[b.q.alert]??-1)-(alert[a.q.alert]??-1))||(b.q.t-a.q.t))
    .map(x=>({...x.q,activity:x.activity}));
}
function lmBanner(html,ms=0){const b=$('lmBanner');b.innerHTML=html;b.hidden=false;clearTimeout(LM.bannerT);if(ms)LM.bannerT=setTimeout(()=>{b.hidden=true},ms)}
async function liveNow(){
  if(tourOn)endTour();
  lmBanner('Checking the USGS feed for the latest earthquakes…');
  if(!feed||Date.now()-feedAt>60e3)await pollFeed();
  const picks=liveCandidates();
  if(!picks.length){
    lmBanner(feed?'No earthquake in the past week has a USGS shaking map yet. Showing the Türkiye 2023 case study instead.':'Can\'t reach USGS from here. Showing the Türkiye 2023 case study instead.',7000);
    pickSeq(SEQ.findIndex(s=>s.key==='turkey'));selectTab('spot');return;
  }
  // Try the top two: a brand-new quake's products can still be incomplete.
  for(const pick of picks.slice(0,2)){
    const it={...pick,kind:'live'};
    enterWorld();focusItem(it);
    lmBanner(`Live from USGS: <b>M${it.M.toFixed(1)}</b>, ${esc(it.place)}, ${esc(ago(Date.now()-it.t))}${it.activity>1?`, one of ${it.activity} quakes of M4.5 or more nearby this week`:''}. Opening its forecast…`);
    await new Promise(r=>setTimeout(r,2200));
    const seq=await openLive(it);
    if(seq){renderLiveCheck();const c=forecastCheck();
      lmBanner(`Live from USGS: <b>M${it.M.toFixed(1)}</b>, ${esc(it.place)}.`+(c?` Forecast check: 24 hours ago the model expected about <b>${c.mean.toFixed(1)}</b> M5+ aftershocks for the next day (90% range ${c.lo} to ${c.hi}); USGS has recorded <b>${c.observed}</b>.`:' Pick a spot to see its forecast.'),15000);return}
  }
  lmBanner('USGS data for the latest quakes could not be loaded just now. The globe and the case studies still work.',9000);
}

// QR code: a short link (#j=<earthquake>.<group>) so the code stays easy to scan from the back
// of a room. The phone expands it into the normal invite when it opens.
function joinLink(){
  const base=['http:','https:'].includes(location.protocol)?location.origin+location.pathname:HOSTED_ORIGIN;
  return base+'#j='+encodeURIComponent(S.key)+(ci.ready&&ci.group?'.'+ci.group:'');
}
function drawQR(text){const q=qrcode(0,'M');q.addData(text);q.make();return q.createSvgTag({cellSize:6,margin:24,scalable:true,alt:'QR code for the link below'})}
function renderJoin(){
  if($('joinModal').hidden)return;
  const items=(ci.items||[]).filter(d=>Date.parse(d.expiresAt)>Date.now()),safe=items.filter(d=>d.status==='safe').length,help=items.length-safe;
  $('joinCount').innerHTML=ci.ready&&ci.group?`<b>${items.length}</b> ${items.length===1?'person has':'people have'} checked in: ${safe} safe, ${help} need help.`
    :'Shared check-ins aren\'t available here, so this code opens the same forecast on your phone.';
  if(items.length!==LM.lastCount&&LM.lastCount>=0&&items.length>LM.lastCount)$('joinCount').classList.add('lm-new');
  LM.lastCount=items.length;
}
function openJoin(){
  if(mode!=='detail'){lmBanner('Open an earthquake first, then share it.',4000);return}
  if(ci.ready&&!ci.group){try{ciSetGroup(ciRandom(16))}catch(e){}}
  const link=joinLink();
  $('joinQR').innerHTML=drawQR(link);$('joinURL').value=link;
  $('joinHow').textContent=ci.ready?'Scan with your phone camera. On your phone, tap where you are on the map, then choose "I\'m safe here" or "I need help here". Your pin appears here within a few seconds.'
    :'Scan with your phone camera to open this forecast on your phone.';
  $('joinModal').hidden=false;LM.lastCount=-1;renderJoin();
  presentPoll(10*60e3);$('joinClose').focus();
}
function closeJoin(){$('joinModal').hidden=true}
// While presenting, refresh check-ins every 3 seconds instead of every 15.
function presentPoll(ms){LM.fastUntil=Date.now()+ms;if(LM.timer)return;
  LM.timer=setInterval(async()=>{if(Date.now()>LM.fastUntil){clearInterval(LM.timer);LM.timer=null;return}
    if(!document.hidden&&mode==='detail'&&ci.ready&&ci.group){await refreshCheckins();renderJoin()}},3000)}
// A phone that arrives from the QR code opens the same earthquake and lands on the check-in controls.
async function arriveFromJoin(){
  const raw=new URLSearchParams(location.hash.slice(1)).get('j');if(!raw)return;
  const [key,group]=raw.split('.');
  history.replaceState(null,'',location.pathname+location.search+(/^[a-f0-9]{32}$/.test(group||'')?'#checkins='+group:''));
  if(group)ciReadInvite();
  if(key.startsWith('live:')){if(!await openLive({id:key.slice(5),place:'',kind:'live'}))return}
  else{const i=SEQ.findIndex(s=>s.key===key);if(i<0)return;pickSeq(i)}
  refreshCheckins();selectTab('people');
  lmBanner(group?'You\'ve joined the room. Tap where you are on the map, then choose "I\'m safe here" or "I need help here".':'This is the forecast from the presentation. Tap a spot on the map to see its estimate.',12000);
}
$('liveBtn').onclick=liveNow;$('joinBtn').onclick=openJoin;$('joinClose').onclick=closeJoin;
$('joinModal').addEventListener('click',e=>{if(e.target===$('joinModal'))closeJoin()});
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('joinModal').hidden)closeJoin()});
$('joinCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('joinURL').value);$('joinCopy').textContent='Copied'}catch{$('joinURL').select()}};

// Live forecast check: refit the model using only quakes recorded up to 24 hours ago, and compare
// its expected count of M5+ aftershocks over the following day with what USGS has recorded since.
let liveCheckCache=null;
function forecastCheck(){
  if(!S||!S.live)return null;
  const end=S.daysAvailable,start=end-1;if(start<0.05)return null;
  if(liveCheckCache?.seq===S&&liveCheckCache.events===S.events&&liveCheckCache.end===end&&liveCheckCache.fetchedAt===S.fetchedAt)return liveCheckCache.result;
  const f=MODEL.fit(S.events,start),cp=SHAKE.compact(f);
  const rates=cp.map(([w,a,p])=>[w,SHAKE.n5(f,a,p,0,1)]);
  const mean=rates.reduce((t,[w,n])=>t+w*n,0);
  // 90% predictive range: draw a parameter set by weight, then a Poisson count (seeded, so it doesn't flicker).
  let seed=11;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const cdf=[];let acc=0;for(const [w] of rates){acc+=w;cdf.push(acc)}
  const draws=[];for(let i=0;i<4000;i++){const u=rng()*acc;let k=cdf.findIndex(c=>c>=u);if(k<0)k=cdf.length-1;const lam=rates[k][1];
    let n=0;if(lam>40)n=Math.max(0,Math.round(lam+Math.sqrt(lam)*Math.sqrt(-2*Math.log(rng()||1e-9))*Math.cos(2*Math.PI*rng())));else{let L=Math.exp(-lam),p=1;do{n++;p*=rng()}while(p>L);n--}draws.push(n)}
  draws.sort((a,b)=>a-b);
  const observed=S.events.filter(e=>e[0]>start&&e[0]<=end&&e[1]>=5).length;
  const result={mean,lo:draws[200],hi:draws[3799],observed,since:new Date(Date.parse(S.fetchedAt)-864e5)};
  liveCheckCache={seq:S,events:S.events,end,fetchedAt:S.fetchedAt,result};return result;
}
function renderLiveCheck(){
  const box=$('liveCheck');if(!box)return;const c=mode==='detail'?forecastCheck():null;
  if(!c){box.hidden=true;return}
  const verdict=c.observed<c.lo?'Fewer than the model expected.':c.observed>c.hi?'More than the model expected: this sequence is more active than the model\'s starting assumptions.':'Within the range the model expected.';
  box.hidden=false;
  box.innerHTML=`<summary>Check against recent aftershocks</summary><p class="p">At ${esc(fmtDT(c.since))}, using only quakes recorded up to then, the model expected about <b>${c.mean.toFixed(1)}</b> aftershocks of M5 or more in the next 24 hours (90% range ${c.lo} to ${c.hi}). USGS has recorded <b>${c.observed}</b> since.</p><p class="muted">${verdict} Recomputed every time USGS data updates.</p>`;
}
setInterval(()=>{if(!document.hidden)renderLiveCheck()},15000);

// A large check-in count over the map while presenting, so the room can watch it rise.
function renderBoard(){
  if(document.hidden)return;
  const b=$('ciBoard');if(!b)return;
  const on=Date.now()<LM.fastUntil&&ci.ready&&ci.group&&mode==='detail'&&$('joinModal').hidden;
  if(!on){b.hidden=true;return}
  const items=(ci.items||[]).filter(d=>Date.parse(d.expiresAt)>Date.now()),safe=items.filter(d=>d.status==='safe').length;
  b.hidden=false;b.innerHTML=`<span><b>${safe}</b> safe</span><span><b>${items.length-safe}</b> need help</span><small>Check-ins from phones in this room</small>`;
}
setInterval(renderBoard,1000);
