// ---------- aftershock rate from Tiger Data ----------
// Observed hourly counts come from the Tiger Data continuous aggregate (api/quakes.js).
// The expected curve is the page's own Reasenberg-Jones fit (cur.f), extended to M4+
// with b = 1. Hidden entirely when the API is absent (file://, static hosts) or the
// stored series has nothing for this area, so standalone copies look unchanged.
const TIGER={enabled:false,timescale:null,key:null,data:null,fetchedAt:0,drawnFor:'',busy:false};
function tigerWindow(){
  const t0=Date.parse(S.t0),end=S.live?Date.now():t0+Math.min(30,Math.max(1,S.daysAvailable))*864e5;
  return{since:new Date(t0-864e5).toISOString(),until:new Date(Math.min(end+36e5,t0+400*864e5)).toISOString(),t0}}
async function tigerProbe(){
  if(!['http:','https:'].includes(location.protocol))return;
  try{const r=await fetch('/api/quakes',{cache:'no-store'});const j=await r.json();TIGER.enabled=!!j.configured;TIGER.timescale=j.timescale??null}catch(e){TIGER.enabled=false}
}
async function tigerFetch(){
  if(!TIGER.enabled||!S||TIGER.busy)return;
  const seq=S,w=tigerWindow();TIGER.busy=true;
  try{
    const ageDays=(Date.now()-w.t0)/864e5;
    const params=new URLSearchParams({lat:seq.lat.toFixed(3),lon:seq.lon.toFixed(3),radiusKm:String(Math.round(Math.min(600,Math.max(10,seq.radiusKm||150)))),since:w.since,until:w.until});
    if(seq.live&&ageDays>0.75)params.set('backfill','1');  // the 1-day feed may not reach back to the mainshock
    const r=await fetch('/api/quakes?'+params,{cache:'no-store'}),j=await r.json().catch(()=>null);
    if(S!==seq)return;
    TIGER.key=seq.key;TIGER.fetchedAt=Date.now();TIGER.data=r.ok&&j?j:{error:(j&&j.error)||'Unavailable'};TIGER.drawnFor='';
  }catch(e){if(S===seq){TIGER.key=seq.key;TIGER.data={error:'Could not reach the server.'};TIGER.drawnFor=''}}
  finally{TIGER.busy=false;renderTiger()}
}
// Expected M>=4 count in [ta, tb] days after the original mainshock, averaged over the posterior.
function tigerExpected(f,ta,tb){
  const B=MODEL.params.B,a0=Math.max(ta,f.tm)-f.tm,b0=tb-f.tm;if(b0<=a0)return 0;
  let s=0;for(const [a,p,w] of f.post)s+=w*Math.pow(10,a+B*(f.Mm-4))*MODEL.integral(a0,b0,p);return s}
function renderTiger(){
  if(document.hidden||mode!=='detail'||activeTab!=='spot')return;
  const card=$('tigerCard');if(!card)return;
  const d=TIGER.data;
  if(!TIGER.enabled||!S||TIGER.key!==S.key||!d||!cur.f||cur.key!==S.key){card.hidden=true;return}
  if(d.error){card.hidden=!S.live;$('tigerChart').innerHTML='';$('tigerNote').textContent='';$('tigerStatus').textContent=`Aftershock series unavailable: ${d.error}`;return}
  const total=d.buckets.reduce((n,b)=>n+b.n4,0);
  if(!total&&!S.live){card.hidden=true;return}
  card.hidden=false;
  if(!visibleCharts.has('tigerChart'))return;
  const stamp=[S.key,cur.now,d.buckets.length,TIGER.fetchedAt,$('tigerChart').clientWidth].join('|');if(stamp===TIGER.drawnFor)return;TIGER.drawnFor=stamp;
  // Re-bin hourly buckets so the chart keeps at most about 72 bars.
  const w=tigerWindow(),t0=w.t0,spanH=Math.max(1,(Math.min(Date.parse(w.until),S.live?Date.now():Infinity)-t0)/36e5);
  const binH=[1,3,6,12,24,48,96].find(h=>spanH/h<=72)||168,nb=Math.max(1,Math.ceil(spanH/binH)),bins=Array.from({length:nb},()=>({n4:0,n5:0,max:null}));
  for(const b of d.buckets){const k=Math.floor((Date.parse(b.hour)-t0)/36e5/binH);if(k<0||k>=nb)continue;bins[k].n4+=b.n4;bins[k].n5+=b.n5;if(b.maxMag!=null)bins[k].max=Math.max(bins[k].max??-9,b.maxMag)}
  const exp=bins.map((_,k)=>tigerExpected(cur.f,k*binH/24,(k+1)*binH/24)),nowBin=cur.now*24/binH;
  const box=$('tigerChart');box.innerHTML='';const W=Math.max(box.clientWidth,260),H=150,m={l:34,r:8,t:10,b:24};
  const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Observed and expected M4+ aftershocks over time'},box);
  const ymax=Math.max(1,...bins.map(b=>b.n4),...exp.slice(0,Math.ceil(nowBin)+2))*1.1,bw=(W-m.l-m.r)/nb,X=k=>m.l+k*bw,Y=v=>H-m.b-Math.min(v,ymax)/ymax*(H-m.t-m.b);
  const g=el('g',{class:'grid'},svg),ax=el('g',{class:'axis'},svg),st=niceStep(ymax,3);
  for(let v=0;v<=ymax;v+=st){el('line',{x1:m.l,x2:W-m.r,y1:Y(v),y2:Y(v)},g);el('text',{x:m.l-5,y:Y(v)+4,'text-anchor':'end'},ax).textContent=Math.round(v)}
  const cs=getComputedStyle(document.documentElement),tok=n=>cs.getPropertyValue(n).trim();
  bins.forEach((b,k)=>{if(b.n4)el('rect',{x:X(k)+0.5,y:Y(b.n4),width:Math.max(1,bw-1),height:Y(0)-Y(b.n4),fill:b.n5?PAL.red:tok('--ink2'),opacity:b.n5?0.85:0.55},svg)});
  const path=exp.map((v,k)=>`${k?'L':'M'}${(X(k)+bw/2).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  el('path',{d:path,fill:'none',stroke:tok('--link'),'stroke-width':2},svg);
  if(nowBin<nb){el('line',{x1:X(nowBin),x2:X(nowBin),y1:m.t,y2:H-m.b,stroke:tok('--mute'),'stroke-dasharray':'3 3'},svg)}
  const days=spanH/24;for(const k of [0,Math.floor(nb/2),nb-1]){const t=k*binH/24;el('text',{x:k===nb-1?W-m.r:k===0?m.l:X(k)+bw/2,y:H-m.b+15,'text-anchor':k===nb-1?'end':k===0?'start':'middle'},ax).textContent=days<3?`${Math.round(t*24)} h`:`day ${Math.round(t)}`}
  const tip=tipper(box);svg.onmousemove=ev=>{const r=svg.getBoundingClientRect(),s=r.width/W,k=Math.max(0,Math.min(nb-1,Math.floor(((ev.clientX-r.left)/s-m.l)/bw))),b=bins[k];
    tip.show((X(k)+bw/2)*s,Y(Math.max(b.n4,exp[k]))*s,`${binH===1?'Hour':binH+' hours'} from ${dur(k*binH/24)}: ${b.n4} M4+ recorded${b.n5?`, ${b.n5} M5+`:''}; model expected ${exp[k].toFixed(1)}`)};
  svg.onmouseleave=tip.hide;
  const seen=bins.reduce((n,b)=>n+b.n5,0);
  $('tigerNote').textContent=`Bars: M4+ quakes recorded per ${binH===1?'hour':binH+' hours'} (red where an M5+ occurred, ${seen} in all). Line: the number this forecast's fitted model expects. The dashed line is the selected time.`;
  const ago=d.lastIngest?Math.max(0,Math.round((Date.now()-Date.parse(d.lastIngest))/60000)):null;
  $('tigerStatus').textContent=`Tiger Data stores ${d.totalStored.toLocaleString()} quakes${d.timescale?' in a hypertable, read through an hourly continuous aggregate':''}. USGS feed pulled ${ago==null?'not yet':ago===0?'under a minute ago':ago+' min ago'}; this query took ${d.queryMs} ms.${d.ingest&&d.ingest.error?' '+d.ingest.error:''}`;
}
let tigerLastFetch=0;
setInterval(()=>{
  if(document.hidden||!TIGER.enabled||!S||mode!=='detail'||activeTab!=='spot')return;
  if(TIGER.key!==S.key||(S.live&&Date.now()-tigerLastFetch>POLL_MS)){tigerLastFetch=Date.now();tigerFetch()}
  else renderTiger();
},1500);
tigerProbe();
