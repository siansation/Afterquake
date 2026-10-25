// Deterministic captions and speech text built from the calculated forecast.
// Device voices change pronunciation, not the language or the underlying figures.
const SPOKEN=(()=>{
  function percentage(text){return text.replace(/^</,'less than ').replace('%',' percent')}
  function summary(s){
    return [
      `Forecast for ${s.place}, following ${s.earthquake}.`,
      `Selected time: ${s.time}.`,
      s.freshness,
      `For a stay of ${s.duration}, the estimated chance of shaking above your selected intensity threshold is ${percentage(s.probability)}.`,
      `The range from aftershock-rate uncertainty alone is ${percentage(s.low)} to ${percentage(s.high)}. Ground, building and model errors add uncertainty.`,
      s.decision,
      'These are estimates for magnitude five or larger aftershocks. Building entry needs an inspection and local authority guidance.'
    ].filter(Boolean).join(' ');
  }
  return {summary};
})();
if(typeof module!=='undefined')module.exports=SPOKEN;
