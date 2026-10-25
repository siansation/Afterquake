// Keep the Türkiye narrative while making its controls and optional feature
// demos easier to use. AI and speech run only when the visitor requests them.
let tourOn=false,tourI=0,tourVersion=0,tourTargets=[],tourPopup=null,tourDataRequested=false;
const STEPS=[
  {id:'place',title:'After the first shaking, the uncertainty remains.',targets:['town'],
    body:()=> 'This is the Türkiye 2023 example. The map shows the original shaking. Further earthquakes can follow, so an estimate cannot tell you that a building is safe to enter.',
    go(){resetChoices();goSeq('turkey');setLayer('mmi');setDays(1/24);goTown('Kahramanmaraş');update();map.fitBounds(G.bounds.pad(-.15));selectTab('spot')}},
  {id:'time',title:'Choose your place and how long you need.',targets:['exposure','now'],
    body:()=> `For ${loc.name}, the estimated chance of damaging shaking over ${exposureLabel()} is ${chance(cur.exposure.probability)}. Change the building or timeframe, or press Read summary for the key steps.`,
    go(){setLayer('risk');setDays(.3);goTown('Kahramanmaraş');update();selectTab('spot');map.setView([loc.lat,loc.lon],8)},
    actions:[['tShort','10 minutes',()=>setTourStay('10')],['tLong','24 hours',()=>setTourStay('1440')]],
    tools:[['tSpeak','Read summary',()=>$('readSummary').click()],['tAsk','Ask Gemini',()=>{setAskOpen(true);markTourTargets({targets:['askPanel']});return ask('Give me a quick summary')}]]},
  {id:'aftershock',title:'A larger aftershock can change the picture.',targets:['now'],
    body:()=> 'A second large earthquake struck nine hours later. New earthquakes and revised data can change an estimate. Follow local officials’ instructions before returning to a building.',
    async go(){setAskOpen(false);setLayer('risk');goTown('Elbistan');setDays(.3);update();map.setView([38.1,37.15],8);if(!await replayStoryEvent(.3,.5,2600))return;tourPopup=L.popup({closeButton:false,autoPan:false}).setLatLng([38.011,37.196]).setContent('<div class="pp-h">M7.5, 9 hours later</div>A second large earthquake.').openOn(map)},
    actions:[['tData','See the earthquake record',showStoryRecords]]},
  {id:'group',title:'Let your group know how you are.',targets:['ciPosting','ciSetup'],
    body:()=> 'Create or join a group, then share your status at your map location. The phone QR link helps others join. These posts are not monitored by emergency services.',
    go(){selectTab('people')},actions:[['tQR','Show phone QR',()=>openJoin()]]},
  {id:'live',title:'Use the same tools for a recent earthquake.',targets:['liveBtn'],
    body:()=> 'Live now opens a recent earthquake with enough data for an estimate.',
    go(){selectTab('spot')},actions:[['tLive','Open a recent earthquake',()=>liveNow()]]},
];
function setTourStay(minutes){$('exposure').value=minutes;update()}
function clearTourTargets(){for(const target of tourTargets)target.classList.remove('tour-focus');tourTargets=[]}
function markTourTargets(step){
  clearTourTargets();
  for(const id of step.targets){const target=$(id);if(target){target.classList.add('tour-focus');tourTargets.push(target)}}
}
// The story and forecast controls share one choice, including during playback.
function updateTourLanguage(){
  const box=$('tVoiceLangBox');if(!tourOn||!box)return;
  const source=$('summaryLang'),picker=$('tSummaryLang');
  box.hidden=$('voiceLangBox').hidden;
  if(picker.innerHTML!==source.innerHTML)picker.innerHTML=source.innerHTML;
  picker.value=source.value;
}
function updateTourEstimate(){
  if(!tourOn)return;
  updateTourLanguage();
  const step=STEPS[tourI],estimate=$('tourEstimate');
  if(step.id==='time'&&cur.f){
    estimate.textContent=`Viewing ${dur(cur.now)} after the earthquake.`;
    $('tShort').setAttribute('aria-pressed',String($('exposure').value==='10'));
    $('tLong').setAttribute('aria-pressed',String($('exposure').value==='1440'));
    $('tourBody').textContent=step.body();
  }
  if(step.id==='time')$('tSpeak').disabled=$('readSummary').disabled;
}
function updateTourData(){
  if(!tourOn||!tourDataRequested)return;
  $('tourFeedback').textContent=TIGER.enabled&&TIGER.data&&!TIGER.data.error&&TIGER.key===S.key
    ?'Tiger Data: bars show recorded earthquakes; the line shows what this forecast expects.'
    :'The earthquake record is unavailable right now. You can still follow the story.';
}
async function showStoryRecords(){
  const version=tourVersion;tourDataRequested=true;selectTab('spot');setAskOpen(false);$('tigerCard').open=true;
  $('tourFeedback').textContent='Opening the earthquake record from Tiger Data…';
  if(!TIGER.enabled)await tigerProbe();await tigerFetch();
  if(tourOn&&version===tourVersion){renderTiger();updateTourData();markTourTargets({targets:['tigerCard']});$('tigerCard').scrollIntoView({block:'nearest'})}
}
async function replayStoryEvent(from,to,ms){
  const version=tourVersion,reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frames=reduced?1:6;playing=true;
  for(let i=1;i<=frames;i++){
    if(!reduced)await new Promise(resolve=>setTimeout(resolve,ms/frames));
    if(!tourOn||version!==tourVersion)return false;
    setDays(from*Math.pow(to/from,i/frames));update();
  }
  playing=false;update();return true;
}
function closeTourPopup(){if(tourPopup){map.closePopup(tourPopup);tourPopup=null}}
function tourLayout(){requestAnimationFrame(()=>{if(mode==='detail'&&S)map.invalidateSize({pan:false});else if(mode==='world')globe.resize()})}
async function showStep(index){
  if(!tourOn)return;
  const version=++tourVersion;stopSummary();pausePlayback();closeTourPopup();tourDataRequested=false;tourI=Math.max(0,Math.min(STEPS.length-1,index));
  const step=STEPS[tourI],box=$('tour');clearTourTargets();box.hidden=false;
  const buttons=items=>items.map(([id,label])=>`<button class="btn" id="${id}">${label}</button>`).join('');
  box.innerHTML=`<div class="tour-copy"><p class="tstep">Step ${tourI+1} of ${STEPS.length}</p><h2 id="tourTitle">${step.title}</h2><p id="tourBody">${esc(step.body())}</p></div><div class="tour-tools"><nav class="tnav" aria-label="Story"><button class="btn" id="tBack" ${tourI===0?'disabled':''}>Back</button><button class="btn primary" id="tNext">${tourI===STEPS.length-1?'Finish':'Next'}</button><button class="btn" id="tExit">Exit</button></nav><div class="row tour-actions">${buttons(step.actions||[])}</div>${step.tools?`<details class="tour-extra"><summary>Try Gemini or ElevenLabs</summary><div class="row"><div class="f tour-language" id="tVoiceLangBox" hidden><label for="tSummaryLang">Summary language</label><select id="tSummaryLang"></select></div>${buttons(step.tools)}</div></details>`:''}<p class="p" id="tourEstimate" role="status"></p><p class="muted" id="tourFeedback" role="status"></p></div>`;
  $('tBack').onclick=()=>showStep(tourI-1);
  $('tNext').onclick=()=>tourI===STEPS.length-1?endTour():showStep(tourI+1);
  $('tExit').onclick=endTour;
  if(step.tools)$('tSummaryLang').onchange=()=>{
    $('summaryLang').value=$('tSummaryLang').value;$('summaryLang').onchange();
  };
  // Navigation stays available during a database read or AI/voice request.
  for(const [id,,action] of [...(step.actions||[]),...(step.tools||[])])$(id).onclick=async()=>{
    const button=$(id);button.disabled=true;
    try{await action()}catch{if(tourOn&&version===tourVersion)$('tourFeedback').textContent='That service is unavailable. You can still continue the walkthrough.'}
    finally{if(tourOn&&version===tourVersion){button.disabled=false;updateTourEstimate()}}
  };
  $('tNext').focus({preventScroll:true});tourLayout();
  try{
    await step.go();
    if(!tourOn||version!==tourVersion)return;
    $('tourBody').textContent=step.body();markTourTargets(step);updateSpokenSummary();updateTourEstimate();tourLayout();
  }catch{if(tourOn&&version===tourVersion)$('tourFeedback').textContent='This feature is unavailable right now. Continue to try the other controls.'}
}
function startTour(){$('welcome').hidden=true;tourOn=true;showStep(0)}
function endTour(){tourOn=false;tourVersion++;stopSummary();pausePlayback();closeTourPopup();clearTourTargets();$('tour').hidden=true;tourLayout();$('storyBtn').focus({preventScroll:true})}
$('storyBtn').onclick=startTour;$('wStory').onclick=startTour;
