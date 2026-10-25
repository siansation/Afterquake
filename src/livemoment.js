// Live moment for presenting: jump to the most significant real earthquake of the past
// week, and let the room join a check-in group from their phones with a QR code.
// Relies on page globals: feed, feedAt, pollFeed, enterWorld, focusItem, openItem, SEQ,
// pickSeq, selectTab, tourOn, endTour, ci, ciSetGroup, ciRandom, refreshCheckins,
// VIEW_STATE, currentView, mode, esc, fmtDT, ago, $.
const HOSTED_ORIGIN='https://afterquake.vercel.app/';
const LM={timer:null,fastUntil:0,lastCount:-1};

// Rank recent quakes that have a USGS ShakeMap: bigger first, then PAGER alert, then newer.
// Deep quakes are skipped: the aftershock and shaking models assume shallow crustal sequences.
function liveCandidates(days=7){
  if(!feed)return [];
  const cut=Date.now()-days*864e5,alert={red:3,orange:2,yellow:1,green:0};
  return feed.quakes.filter(q=>q.shakemap&&q.t>=cut&&!(q.depth>70))
    .sort((a,b)=>(b.M-a.M)||((alert[b.alert]??-1)-(alert[a.alert]??-1))||(b.t-a.t));
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
    lmBanner(`Live from USGS: <b>M${it.M.toFixed(1)}</b>, ${esc(it.place)}, ${esc(ago(Date.now()-it.t))}. Opening its forecast…`);
    await new Promise(r=>setTimeout(r,2200));
    const seq=await openLive(it);
    if(seq){lmBanner(`Live from USGS: <b>M${it.M.toFixed(1)}</b>, ${esc(it.place)}. Pick a spot to see its forecast.`,9000);return}
  }
  lmBanner('USGS data for the latest quakes could not be loaded just now. The globe and the case studies still work.',9000);
}

// QR code: a short link (#j=<earthquake>.<group>) so the code stays easy to scan from the back
// of a room. The phone expands it into the normal invite when it opens.
function joinLink(){
  const base=['http:','https:'].includes(location.protocol)?location.origin+location.pathname:HOSTED_ORIGIN;
  return base+'#j='+encodeURIComponent(S.key)+(ci.ready&&ci.group?'.'+ci.group:'');
}
function drawQR(text){const q=qrcode(0,'M');q.addData(text);q.make();return q.createSvgTag({cellSize:6,margin:2,scalable:true,alt:'QR code for the link below'})}
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
  presentPoll(5*60e3);$('joinClose').focus();
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
