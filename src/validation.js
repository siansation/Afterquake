// Retrospective checks against the downloaded, revised catalogue. These checks
// validate regional M5+/M6+ occurrence, not local shaking, damage or safe entry.
const VALIDATION = (() => {
  const CHECKS = [0.5, 1, 2, 3, 7, 14, 30, 60];
  function backtest(sequences, model) {
    const rows = [];
    for (const s of sequences) for (const t of CHECKS) {
      if (t + 7 > s.daysAvailable) continue; // never score a partial outcome window
      const f = model.fit(s.events, t);
      for (const magnitude of [5, 6]) rows.push({
        sequence: s.key, day: t, magnitude,
        probability: model.prob(f, magnitude, 0, 7),
        occurred: s.events.some(e => e[0] > t && e[0] <= t + 7 && e[1] >= magnitude)
      });
    }
    return rows;
  }
  function summarize(rows, magnitude) {
    const r = rows.filter(x => x.magnitude === magnitude);
    if (!r.length) return null;
    const observed = r.reduce((sum, x) => sum + Number(x.occurred), 0) / r.length;
    const brier = r.reduce((sum, x) => sum + (x.probability - Number(x.occurred)) ** 2, 0) / r.length;
    // Descriptive only: this pooled baseline uses the same outcomes being scored.
    const pooledBrier = r.reduce((sum, x) => sum + (observed - Number(x.occurred)) ** 2, 0) / r.length;
    // Exclude the entire target sequence when estimating the reference frequency.
    // Holding out individual windows would leak outcomes from overlapping windows.
    // Other sequences may occur later, so this reference is not a chronological test.
    const reference = r.map(x => {
      const train = r.filter(y => y.sequence !== x.sequence);
      return train.length ? train.reduce((sum, y) => sum + Number(y.occurred), 0) / train.length : null;
    });
    const heldOutBrier = reference.every(x => x !== null)
      ? r.reduce((sum, x, i) => sum + (reference[i] - Number(x.occurred)) ** 2, 0) / r.length : null;
    return { magnitude, forecasts: r.length, sequences: new Set(r.map(x => x.sequence)).size,
      occurrences: Math.round(observed * r.length), observed,
      meanForecast: r.reduce((sum, x) => sum + x.probability, 0) / r.length,
      brier, pooledBrier, pooledSkill: pooledBrier > 0 ? 1 - brier / pooledBrier : null,
      heldOutBrier, heldOutSkill: heldOutBrier > 0 ? 1 - brier / heldOutBrier : null,
      reliability: [[0, .1], [.1, .3], [.3, .6], [.6, 1.01]].map(([low, high]) => {
        const bin = r.filter(x => x.probability >= low && x.probability < high);
        return { low, high: Math.min(1, high), count: bin.length,
          meanForecast: bin.length ? bin.reduce((s, x) => s + x.probability, 0) / bin.length : null,
          observed: bin.length ? bin.reduce((s, x) => s + Number(x.occurred), 0) / bin.length : null };
      }) };
  }
  return { CHECKS, backtest, summarize };
})();
if (typeof module !== 'undefined') module.exports = VALIDATION;
