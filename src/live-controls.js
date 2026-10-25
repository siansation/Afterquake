// Apply a complete, version-checked live update without resetting the user's view.
let liveOpenToken=0,latestLiveLoad=0;
function registerLive({seq,shakemap,extra}){
  if(D.shakemaps[seq.key]!==shakemap||!BASE[seq.key]){
    const m=LIVE.basemap({land:WGEO.land50,borders:WGEO.borders50},shakemap,seq,WTOWNS);
    BASE[seq.key]=m.base;POP.towns[seq.key]=m.towns;POP.seqCountry[seq.key]=m.country;
  }
  D.shakemaps[seq.key]=shakemap;EX[seq.key]=extra;liveSeqs[seq.id]=seq;
}
async function openLive(it){
  if(liveSeqs[it.id]){const seq=liveSeqs[it.id];pickSeq(seq);selectTab('spot');await refreshLive();return S===seq?seq:null}
  loadingLive=true;const load=++latestLiveLoad,token=++liveOpenToken;
  const box=$('gLoad'),steps=[['event','Finding the event'],['shakemap','Checking the shaking map'],['catalogue','Downloading the aftershock catalogue'],['pager','Checking the PAGER report']];
  const show=s=>{if(token!==liveOpenToken)return;const k=steps.findIndex(x=>x[0]===s);box.innerHTML=`<b>Loading ${esc(it.place||it.id)}</b><ol>${steps.map(([,text],j)=>`<li class="${j<k?'done':j===k?'now':''}">${text}</li>`).join('')}</ol>`};
  box.hidden=false;show('event');
  try{
    const result=await LIVE.load(it.id,show);
    if(token!==liveOpenToken)return null;
    // An older request for the same event must not replace the selected grid's cache.
    registerLive(result);
    box.hidden=true;pickSeq(result.seq);selectTab('spot');return result.seq;
  }catch(e){
    if(token===liveOpenToken){box.innerHTML=`<b>Could not load this earthquake</b><p>${esc(e.message)}</p><button class="btn" id="gLoadX">Close</button>`;$('gLoadX').onclick=()=>box.hidden=true;$('gLoadX').focus()}
    return null;
  }finally{if(load===latestLiveLoad){loadingLive=false;if(token!==liveOpenToken)box.hidden=true}}
}
function renderDataStatus(){
  if(!S)return;
  $('liveActions').hidden=!S.live;
  if(!S.live){$('dataNotice').textContent='Recorded example. This is not a live forecast.';$('dataNotice').classList.toggle('data-delayed',false);$('dataStatus').classList.toggle('data-delayed',false);$('dataStatus').textContent=`Recorded data, downloaded ${fmtDate(new Date(D.fetchedAt))}; ${(G.dlat*111).toFixed(1)} km grid.`;return}
  const age=Date.now()-Date.parse(S.fetchedAt),delayed=!!S.refreshError||age>POLL_MS*2;
  $('dataNotice').textContent=delayed?`Updates delayed. Last data from ${fmtClock(new Date(S.fetchedAt))}. Follow local officials for current instructions.`:`Live estimate. Updated ${fmtClock(new Date(S.fetchedAt))}.`;
  $('dataNotice').classList.toggle('data-delayed',delayed);
  const text=[`Catalogue through ${fmtDT(new Date(S.fetchedAt))}.`,
    `Shaking products checked ${fmtDT(new Date(S.checkedAt||S.fetchedAt))}; ShakeMap ${G.version||'version unavailable'}${G.status?', '+G.status:''}.`,
    delayed?'Updates delayed. Showing the last successful data.':'Checks every 2 minutes.',
    S.refreshError?`Last refresh failed: ${S.refreshError}`:'',...(S.warnings||[]),
    `${(G.dlat*111).toFixed(1)} km grid. This is not an official USGS forecast.`];
  $('dataStatus').textContent=text.filter(Boolean).join(' ');
  $('dataStatus').classList.toggle('data-delayed',delayed||!!S.warnings?.length);
  $('refreshLive').disabled=!!S.refreshing||playing||tourOn;
  $('followLive').disabled=playing||tourOn;
  $('refreshLive').textContent=S.refreshing?'Checking USGS...':'Refresh USGS';
  if(delayed&&mode==='detail'&&replayTimeOverride==null&&+$('now').value>=1000)$('hNote').textContent=`Updates delayed; last data ${fmtClock(new Date(S.fetchedAt))}`;
}
async function refreshLive(){
  if(mode!=='detail'||!S?.live||playing||tourOn)return null;
  const seq=S;if(seq.refreshing)return null;
  seq.refreshing=true;seq.lastAttemptAt=new Date().toISOString();renderDataStatus();
  const oldGrid=D.shakemaps[seq.key];
  try{
    const result=await LIVE.load(seq.id,()=>{},{seq,shakemap:oldGrid,extra:EX[seq.key]||{}});
    // Navigating while a request is pending must not overwrite another forecast.
    if(S!==seq||mode!=='detail')return null;
    const following=replayTimeOverride==null&&+$('now').value>=1000;
    const absoluteTime=Date.parse(seq.t0)+selectedDays()*864e5;
    const gridChanged=result.shakemap!==oldGrid;
    Object.assign(seq,result.seq,{refreshError:null});result.seq=seq;registerLive(result);
    if(gridChanged){
      installSequenceGrid(false);
      const wrap=p=>({...p,lon:p.lon+360*Math.round((S.lon-p.lon)/360)});
      const a=wrap(loc);
      if(gridAt(a.lat,a.lon)?.vs)setLoc(a.lat,a.lon,a.name,false);
      else{defaultSpot();seq.warnings.push('The previous A pin is outside the revised grid; a new initial spot is shown.')}
      buildBuildingOptions();
    }
    timelineBounds();
    if(following){replayTimeOverride=null;$('now').value=1000}else setAbsoluteReplayTime(absoluteTime);
    // Invalidate on every successful refresh, including magnitude/location revisions
    // that leave the event count unchanged. The old count-only check missed these.
    invalidateForecast();renderHeader();renderLedger();renderPager();update();return seq;
  }catch(e){
    if(S===seq){seq.refreshError=e.message||'Could not reach USGS.';renderDataStatus();renderPager();updateSpokenSummary()}
    return null;
  }finally{seq.refreshing=false;if(S===seq)renderDataStatus()}
}
$('refreshLive').onclick=()=>refreshLive();
$('followLive').onclick=()=>{replayTimeOverride=null;$('now').value=1000;update()};
