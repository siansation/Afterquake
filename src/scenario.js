// Forecast durations, probability labels and distances. No DOM or network dependencies.
// Duration changes the integration window; probabilities must never be scaled linearly.
const SCENARIO = (() => {
  function durationDays(minutes) {
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      throw new RangeError('Choose an exposure between 1 minute and 24 hours.');
    }
    return minutes / 1440;
  }
  function durationLabel(minutes) {
    durationDays(minutes);
    return minutes < 60 ? `${minutes} minute${minutes === 1 ? '' : 's'}`
      : minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
        : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }
  function formatProbability(p) {
    if (!Number.isFinite(p) || p < 0 || p > 1 + 1e-10) throw new RangeError('Invalid probability.');
    if (p === 0) return '0%';
    if (p < 1e-6) return '<0.0001%';
    if (p < .01) return `${Number((p * 100).toPrecision(2))}%`;
    return `${(Math.min(1, p) * 100).toFixed(1)}%`;
  }
  function exposure(shake, f, cp, q, minutes) {
    const days = durationDays(minutes);
    return { minutes, days, probability: shake.probQ(f, cp, q, 0, days),
      range: shake.parameterRange(f, cp, q, 0, days) };
  }
  function distanceKm(a, b) {
    const rad = Math.PI / 180, dlat = (b.lat - a.lat) * rad, dlon = (b.lon - a.lon) * rad;
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  return { durationDays, durationLabel, formatProbability, exposure, distanceKm };
})();
if (typeof module !== 'undefined') module.exports = SCENARIO;
