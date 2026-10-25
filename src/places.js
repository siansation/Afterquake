// Small helpers shared by the map, spoken summary and assistant. Optional
// exploration stays separate from the short action card on the main screen.
const exposureLabel=()=>SCENARIO.durationLabel(+$('exposure').value);
const chance=SCENARIO.formatProbability;
function observedHazards(){return [...document.querySelectorAll('#around input:checked')].map(input=>input.value)}
function renderActions(){
  const box=$('verdict');box.className='verdict';
  box.innerHTML=`<h2>What to do now</h2><p class="big">Estimated chance of damaging shaking: <b>${chance(cur.exposure.probability)}</b> over ${exposureLabel()}.</p><ul>${SPOKEN.actions(observedHazards()).map(step=>`<li>${esc(step)}</li>`).join('')}</ul>`;
}
function coastDistance(lat,lon){
  const [x,y]=km(lat,lon);let coast=Infinity;
  for(const [ax,ay,bx,by] of G.coast){const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy||1;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/len));
    coast=Math.min(coast,Math.hypot(ax+t*dx-x,ay+t*dy-y))}
  return coast;
}
