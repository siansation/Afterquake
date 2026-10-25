// One figure and practical next steps. Technical detail stays on the page, rather
// than making people listen through settings, ranges and projected entry times.
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
    return [
      s.delayed?'Updates are delayed. Do not rely on this estimate alone.':'',
      s.recorded?'Recorded example.':'',
      `${s.place}: the estimated chance of damaging shaking over ${s.duration} is ${percentage(s.probability)}.`,
      ...actions(s.hazards)
    ].filter(Boolean).join(' ');
  }
  return {summary,actions};
})();
if(typeof module!=='undefined')module.exports=SPOKEN;
