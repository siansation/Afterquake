// One estimate, event context and practical next steps. The selected date gives
// historical context without a repeated label or a long explanation.
const SPOKEN=(()=>{
  function percentage(text){return text.replace(/^</,'less than ').replace(/^>/,'more than ').replace('%',' percent')}
  function actions(hazards=[]){
    const outside=hazards.includes('slope')?'If outside, keep clear of steep slopes and falling debris.'
      :hazards.includes('trees')?'If outside, keep clear of buildings, trees and power lines.'
      :'If outside, keep clear of buildings and fallen power lines.';
    return ['If shaking starts, drop, cover and hold on.',outside,
      'Wait for a building inspection and local officials’ guidance before returning.'];
  }
  function summary(s){
    const steps=actions(s.hazards),observed=(s.hazards||[]).some(h=>h==='slope'||h==='trees');
    const context=observed?'':localContext(s.building,s.ground);
    return [
      s.delayed?'Updates are delayed. Do not rely on this estimate alone.':'',
      `${s.place}${s.date?', '+s.date:''}: the estimated chance of damaging shaking over ${s.duration} is ${percentage(s.probability)}.`,
      Number.isFinite(s.magnitude)?`The main earthquake was magnitude ${s.magnitude.toFixed(1)}.`:'',
      context,
      steps[0],context?'':steps[1],steps[2]
    ].filter(Boolean).join(' ');
  }
  // These are map/model conditions or an explicit user choice, not an inspection
  // of the building. Mention only the most relevant one to keep the readout short.
  function localContext(building,ground={}){
    if(building==='6')return 'You selected a building that is already damaged.';
    if(ground.ls!=null&&ground.ls>=.05)return 'Landslide risk was mapped on slopes here.';
    if(ground.liq!=null&&ground.liq>=.1)return 'Possible unstable ground was mapped here.';
    if(ground.vs>0&&ground.vs<180)return 'Soft ground here can increase shaking.';
    if(ground.mmi>=7)return 'Strong earlier shaking was mapped here.';
    return '';
  }
  return {summary,actions,localContext};
})();
if(typeof module!=='undefined')module.exports=SPOKEN;
