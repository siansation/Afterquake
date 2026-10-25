// Explicit sharing, saved setup restoration, and device-provided speech.
// Shared links carry inputs and an absolute time; figures are recalculated on arrival.
let shareOpenToken=0;
function currentView(){
  return VIEW_STATE.clean({v:1,event:{kind:S.live?'live':'case',id:S.live?S.id:S.key},a:loc,b:comparisonLocation,
    minutes:cur.exposure.minutes,building:$('bld').value,tolerance:cur.tol,calibrated:cur.calib,
    at:cur.nowDate.toISOString(),dataAt:S.live?S.fetchedAt:D.fetchedAt});
}
function applyViewSetup(input,{keepTime=false}={}){
  const view=VIEW_STATE.clean(input),wrap=p=>({...p,lon:p.lon+360*Math.round((S.lon-p.lon)/360)});
  const a=wrap(view.a),b=view.b?wrap(view.b):null;
  // Validate both pins before changing anything; a newer grid may cover a different area.
  if(!gridAt(a.lat,a.lon)?.vs||(b&&!gridAt(b.lat,b.lon)?.vs))throw new Error('A saved pin is outside the current shaking grid. The setup was not applied.');
  if(playing)$('play').click();if(tourOn)endTour();
  setLoc(a.lat,a.lon,a.name,false);$('bld').value=view.building;buildBuildingOptions();
  $('exposure').value=String(view.minutes);$('shk').value=view.calibrated?'1':'0';setTol(String(view.tolerance));
  comparisonLocation=b;$('comparisonTown').value=b?b.name:'';$('clearComparison').disabled=!b;setComparisonPicking(false);
  const clamped=!keepTime&&setAbsoluteReplayTime(Date.parse(view.at));
  heatKey='';update();selectTab('spot');
  if(b)map.fitBounds(L.latLngBounds([[a.lat,a.lon],[b.lat,b.lon]]).pad(.15));else map.setView([a.lat,a.lon],Math.max(map.getZoom(),9));
  return {clamped};
}
$('restoreCheck').onclick=()=>{
  const saved=savedChecks[S.key];if(!saved)return;
  try{
    // Legacy checks did not store absolute time or B. Restore their location/settings
    // while leaving the CURRENT time and live-following state intact.
    const view=VIEW_STATE.fromCheck({...saved,at:saved.at||new Date(Date.parse(S.t0)+saved.now*864e5).toISOString()});
    applyViewSetup(view,{keepTime:true});checkFeedback='Saved location and settings restored. The current forecast time was kept.';renderChanges();
  }catch(e){checkFeedback=e.message;renderChanges()}
};
$('shareView').onclick=async()=>{
  try{
    const link=VIEW_STATE.url(location.href,currentView());$('shareURL').value=link;$('shareLinkBox').hidden=false;
    if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(link);$('shareStatus').textContent='Link copied. It includes both pins, settings and the selected time.';return}catch(e){/* Manual copying remains available. */}}
    $('shareURL').focus();$('shareURL').select();$('shareStatus').textContent='Copy the selected link. It includes both pins, settings and the selected time.';
  }catch(e){$('shareStatus').textContent=e.message}
};
async function openSharedView(){
  const token=++shareOpenToken;let view;
  try{view=VIEW_STATE.parse(location.hash)}catch(e){$('sharedNotice').hidden=false;$('sharedNotice').textContent=e.message;return false}
  if(!view){$('sharedNotice').hidden=true;return false}
  $('sharedNotice').hidden=false;$('sharedNotice').textContent='Opening the shared view...';
  try{
    if(view.event.kind==='case'){
      const index=SEQ.findIndex(s=>s.key===view.event.id);if(index<0)throw new Error('This case study is not available.');pickSeq(index);
    }else{
      const seq=await openLive({id:view.event.id,place:view.event.id});if(!seq)throw new Error('The shared earthquake could not be loaded. Try the link again.');
    }
    if(token!==shareOpenToken)return false;
    const result=applyViewSetup(view);
    $('sharedNotice').textContent=`Shared view opened at ${fmtDT(cur.nowDate)}. Recalculated using the available data; figures can differ after data revisions.${result.clamped?' The shared time was outside the available timeline and was moved to its nearest end.':''}`;
    return true;
  }catch(e){if(token===shareOpenToken)$('sharedNotice').textContent=e.message;return false}
}
addEventListener('hashchange',()=>openSharedView());

let speechToken=0,activeSpeech=null,lastSummary='';
const speechSupported=typeof speechSynthesis!=='undefined'&&typeof SpeechSynthesisUtterance!=='undefined';
function stopSummary(message='Reading stopped.'){
  const active=!!activeSpeech;speechToken++;
  if(active&&speechSupported)speechSynthesis.cancel();activeSpeech=null;
  $('stopSummary').disabled=true;
  if(active)$('speechStatus').textContent=message;
}
function speechVoices(){
  if(!speechSupported)return [];
  try{return speechSynthesis.getVoices().filter(v=>/^en(?:-|_|$)/i.test(v.lang))}catch(e){return []}
}
function populateVoices(){
  const keep=$('summaryVoice').value,voices=speechVoices();
  $('summaryVoice').innerHTML='<option value="">Default English voice</option>'+voices.map(v=>`<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  if(voices.some(v=>v.voiceURI===keep))$('summaryVoice').value=keep;
}
function updateSpokenSummary(){
  if(!cur.f)return;
  $('readSummary').disabled=!speechSupported||playing||tourOn;
  const decision=cur.re===0?'The model is below your chosen risk limit for this exposure.':cur.re===Infinity?'The model does not fall below your chosen limit within its four hundred day search.':`The projected start below your limit is ${fmtDT(new Date(cur.nowDate.getTime()+cur.re*864e5))}, assuming the model continues unchanged.`;
  const delayed=S.live&&(S.refreshError||Date.now()-Date.parse(S.fetchedAt)>POLL_MS*2);
  const freshness=S.live?`${delayed?'Updates are delayed. Using the last successful data. ':''}Catalogue through ${fmtDT(new Date(S.fetchedAt))}. ${(S.warnings||[]).join(' ')}`:`Recorded case study data, downloaded ${fmtDate(new Date(D.fetchedAt))}.`;
  const summary=SPOKEN.summary({place:loc.name,earthquake:S.label,time:fmtDT(cur.nowDate),duration:exposureLabel(),
    probability:chance(cur.exposure.probability),low:chance(cur.exposure.range.low),high:chance(cur.exposure.range.high),decision,freshness});
  if(summary!==lastSummary){stopSummary('The forecast changed. Press Read summary to hear the updated figures.');lastSummary=summary;$('spokenText').textContent=summary}
}
$('readSummary').disabled=!speechSupported;$('stopSummary').disabled=true;
if(!speechSupported)$('speechStatus').textContent='Speech is unavailable in this browser. The text summary is available below.';
else{
  populateVoices();speechSynthesis.addEventListener?.('voiceschanged',populateVoices);
  $('speechStatus').textContent='English summary using your browser or device voices.';
}
$('readSummary').onclick=()=>{
  if(!speechSupported||!cur.f)return;updateSpokenSummary();stopSummary();
  const token=++speechToken,utterance=new SpeechSynthesisUtterance(lastSummary);
  const voice=speechVoices().find(v=>v.voiceURI===$('summaryVoice').value);
  if(voice)utterance.voice=voice;utterance.lang=voice?.lang||'en-GB';utterance.rate=+$('summarySpeed').value||.9;
  activeSpeech=utterance;$('stopSummary').disabled=false;$('speechStatus').textContent='Reading the current summary. Changes to the forecast stop playback.';
  utterance.onend=()=>{if(token===speechToken){activeSpeech=null;$('stopSummary').disabled=true;$('speechStatus').textContent='Summary finished.'}};
  utterance.onerror=()=>{if(token===speechToken){activeSpeech=null;$('stopSummary').disabled=true;$('speechStatus').textContent='Could not play speech. Read the text summary below.'}};
  try{speechSynthesis.speak(utterance)}catch(e){utterance.onerror()}
};
$('stopSummary').onclick=()=>stopSummary();
$('summaryVoice').onchange=()=>stopSummary('Voice changed. Press Read summary to start again.');
$('summarySpeed').onchange=()=>stopSummary('Speed changed. Press Read summary to start again.');
addEventListener('pagehide',()=>stopSummary());
