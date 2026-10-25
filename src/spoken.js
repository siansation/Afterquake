// Deterministic captions and speech text built from the calculated forecast.
// Device voices change pronunciation, not the language or the underlying figures.
const SPOKEN=(()=>{
  function percentage(text){return text.replace(/^</,'less than ').replace('%',' percent')}
  function summary(s){
    return [
      `This is the forecast for ${s.place} at ${s.time}, following ${s.earthquake}.`,
      s.freshness,
      `For a stay of ${s.duration}, the estimated chance of shaking above your selected intensity threshold is ${percentage(s.probability)}.`,
      `Allowing for aftershock-rate uncertainty alone gives a range of ${percentage(s.low)} to ${percentage(s.high)}. Ground, building and model errors add to that uncertainty.`,
      s.decision,
      'These estimates cover magnitude five or larger aftershocks, so they are only part of the picture. Building entry needs an inspection and local authority guidance.'
    ].filter(Boolean).join(' ');
  }
  return {summary};
})();
if(typeof module!=='undefined')module.exports=SPOKEN;
