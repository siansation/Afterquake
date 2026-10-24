// Decision support for the retrospective explorer. No DOM or network dependencies.
// Duration changes the integration window; probabilities must never be scaled linearly.
const SCENARIO = (() => {
  const VERSION = 1;
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
  function knownEvents(events, now) {
    // Store only origin times available at the saved replay moment. Including the
    // full catalogue here would leak future events into the later change explanation.
    return events.filter(e => e[0] >= -.001 && e[0] <= now).map(e => e.slice(0, 4));
  }
  function validSnapshot(s) {
    return !!s && s.version === VERSION && typeof s.sequence === 'string' &&
      !!s.location && typeof s.location.name === 'string' &&
      Number.isFinite(s.location.lat) && Math.abs(s.location.lat) <= 90 &&
      Number.isFinite(s.location.lon) && Math.abs(s.location.lon) <= 360 &&
      Number.isFinite(s.now) && s.now >= 0 &&
      Number.isFinite(s.minutes) && s.minutes >= 1 && s.minutes <= 1440 &&
      Number.isFinite(s.probability) && s.probability >= 0 && s.probability <= 1 + 1e-10 &&
      Number.isFinite(s.threshold) && Number.isFinite(s.q) && s.q >= 0 && s.q <= 1 + 1e-10 &&
      Number.isFinite(s.tolerance) && s.tolerance > 0 && s.tolerance < 1 &&
      Number.isFinite(s.savedAt) && typeof s.building === 'string' &&
      typeof s.calibrated === 'boolean' && typeof s.dataVersion === 'string' &&
      typeof s.gridVersion === 'string' && typeof s.modelVersion === 'string' &&
      Array.isArray(s.events) && s.events.every(e => Array.isArray(e) && e.length === 4 &&
        e.every(Number.isFinite) && e[0] >= -.001 && e[0] <= s.now);
  }
  function capture(input) {
    const s = { ...input, version: VERSION, location: { ...input.location }, events: knownEvents(input.events, input.now) };
    if (!validSnapshot(s)) throw new RangeError('Cannot save an incomplete forecast check.');
    return s;
  }
  function catalogueSignature(events, until) {
    // Ordering is not a revision. A tuple change is; IDs and issue timestamps are
    // unavailable in the bundled catalogue, so do not infer which field was revised.
    return events.filter(e => e[0] <= until).map(e => JSON.stringify(e)).sort().join('|');
  }
  function changes(previous, current) {
    if (!validSnapshot(current)) throw new RangeError('Invalid current forecast check.');
    if (!validSnapshot(previous) || previous.sequence !== current.sequence) {
      return { status: 'missing', reasons: [], assumptionsChanged: false, delta: null };
    }
    const reasons = [];
    const moved = distanceKm(previous.location, current.location) > .001;
    const settingsChanged = previous.minutes !== current.minutes || previous.building !== current.building ||
      previous.calibrated !== current.calibrated || previous.tolerance !== current.tolerance;
    const thresholdChanged = previous.threshold !== current.threshold;
    if (moved) reasons.push(`Location changed from ${previous.location.name} to ${current.location.name}.`);
    if (previous.minutes !== current.minutes) reasons.push(`Exposure changed from ${durationLabel(previous.minutes)} to ${durationLabel(current.minutes)}.`);
    if (previous.building !== current.building) reasons.push('The building assumption changed.');
    if (previous.calibrated !== current.calibrated) reasons.push('The shaking equation option changed.');
    if (previous.tolerance !== current.tolerance) reasons.push('Your chosen risk limit changed; this changes the projected crossing time, not the shaking probability.');
    if (thresholdChanged) reasons.push('The modelled intensity threshold changed.');
    const forward = current.now - previous.now > 1e-8, backward = previous.now - current.now > 1e-8;
    const commonTime = Math.min(previous.now, current.now);
    const revised = catalogueSignature(previous.events, commonTime) !== catalogueSignature(current.events, commonTime);
    if (revised) reasons.push('Catalogue entries at or before the earlier replay time changed.');
    if (current.dataVersion !== previous.dataVersion) reasons.push('The downloaded data snapshot was refreshed.');
    if (current.gridVersion !== previous.gridVersion) reasons.push('The mainshock or ground-failure data version changed.');
    if (current.modelVersion !== previous.modelVersion) reasons.push('The model configuration or fitted coefficient changed.');
    if (forward) {
      reasons.push(`Replay time advanced by ${durationLabelForElapsed((current.now - previous.now) * 1440)}.`);
      const added = current.events.filter(e => e[0] > previous.now && e[0] <= current.now);
      if (added.length) {
        const large = added.filter(e => e[1] >= 5), max = Math.max(...added.map(e => e[1]));
        reasons.push(`${added.length} additional catalogue event${added.length === 1 ? '' : 's'} became visible (${large.length} M5+; largest M${max.toFixed(1)}). New events affect the fit or source locations; they do not always increase the estimate.`);
      } else if (!revised && !moved && !settingsChanged && !thresholdChanged && current.modelVersion === previous.modelVersion && current.gridVersion === previous.gridVersion) {
        reasons.push('No additional catalogue events became visible. With these inputs unchanged, the model generally estimates less aftershock activity as time passes.');
      }
    } else if (backward) reasons.push('Replay time moved backwards; events after this moment are excluded from the model.');
    if (!reasons.length && Math.abs(current.q - previous.q) > 1e-10) reasons.push('The local shaking or source-location estimate changed.');
    const delta = current.probability - previous.probability;
    if (!reasons.length && Math.abs(delta) > 1e-10) reasons.push('The model estimate changed; the saved inputs do not identify a single cause.');
    return { status: reasons.length ? 'changed' : 'same', reasons, assumptionsChanged: moved || settingsChanged || thresholdChanged,
      delta, previousProbability: previous.probability, currentProbability: current.probability };
  }
  function durationLabelForElapsed(minutes) {
    if (minutes < 1) return 'less than a minute';
    if (minutes < 60) return `${Math.round(minutes)} minutes`;
    if (minutes < 1440) return `${Number((minutes / 60).toFixed(1))} hours`;
    return `${Number((minutes / 1440).toFixed(1))} days`;
  }
  return { durationDays, durationLabel, formatProbability, exposure, distanceKm, capture, validSnapshot, changes };
})();
if (typeof module !== 'undefined') module.exports = SCENARIO;
