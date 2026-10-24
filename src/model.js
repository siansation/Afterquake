// Aftershock forecast model (Reasenberg & Jones 1989, with a Bayesian update like USGS's operational forecasts).
// Rate of aftershocks with magnitude >= M at t days after the largest shock so far:
//   lambda(t, M) = 10^(a + b*(Mmain - M)) * (t + c)^(-p)
// Generic global prior (active crustal regions, Page et al. 2016): a ~ N(-2.42, 0.5), b = 1, p = 0.98, c = 0.018 d.
// The sequence's own aftershocks update a and p on a grid; forecasts are averaged over that posterior,
// and Monte Carlo draws (parameter draw + Poisson count) give the spread.
const MODEL = (() => {
  const B = 1.0, C = 0.018, A0 = -2.42, ASD = 0.5, P0 = 0.98, PSD = 0.08;
  const MC = 5.0;          // fit from M5: global catalogues mix magnitude types below this, which inflates small-quake counts
  const TSTART = 0.05;     // ignore the first ~1 hour, when small quakes are missed in the coda
  const AG = [], PG = [];
  for (let a = -4.5; a <= -0.5; a += 0.05) AG.push(+a.toFixed(3));
  for (let p = 0.8; p <= 1.4; p += 0.02) PG.push(+p.toFixed(3));

  // integral of (t+c)^-p dt from t1 to t2
  function I(t1, t2, p) {
    if (t2 <= t1) return 0;
    if (Math.abs(p - 1) < 1e-6) return Math.log((t2 + C) / (t1 + C));
    return (Math.pow(t2 + C, 1 - p) - Math.pow(t1 + C, 1 - p)) / (1 - p);
  }

  // Fit using only events known at time `now` (days since the original mainshock).
  function fit(events, now) {
    const known = events.filter(e => e[0] <= now);
    // largest shock so far restarts the clock (USGS practice)
    let main = known.filter(e => e[0] >= -0.001).reduce((m, e) => (e[1] > m[1] ? e : m), [0, 0]);
    const tm = main[0], Mm = main[1];
    const T = now - tm;
    const obs = known.filter(e => e[0] > tm + TSTART && e[1] >= MC).map(e => e[0] - tm);
    const n = obs.length;
    const post = [];
    let max = -Infinity;
    for (const a of AG) for (const p of PG) {
      const k = Math.pow(10, a + B * (Mm - MC));
      let ll = -k * I(TSTART, Math.max(TSTART, T), p);
      for (const t of obs) ll += Math.log(k) - p * Math.log(t + C);
      ll += -0.5 * ((a - A0) / ASD) ** 2 - 0.5 * ((p - P0) / PSD) ** 2;
      post.push([a, p, ll]);
      if (ll > max) max = ll;
    }
    let z = 0;
    for (const q of post) { q[2] = Math.exp(q[2] - max); z += q[2]; }
    for (const q of post) q[2] /= z;
    let ma = 0, mp = 0;
    for (const [a, p, w] of post) { ma += a * w; mp += p * w; }
    return { post, tm, Mm, now, n, aMean: ma, pMean: mp };
  }

  // Expected number of shocks >= M in [now+t1, now+t2] (days from now) for one parameter pair
  function expected(f, a, p, M, t1, t2) {
    const s = f.now - f.tm;
    return Math.pow(10, a + B * (f.Mm - M)) * I(s + t1, s + t2, p);
  }
  // Probability of at least one shock >= M, averaged over the posterior
  function prob(f, M, t1, t2) {
    let pr = 0;
    for (const [a, p, w] of f.post) if (w > 1e-7) pr += w * (1 - Math.exp(-expected(f, a, p, M, t1, t2)));
    return pr;
  }
  // Monte Carlo: draw parameters from the posterior, then a Poisson count
  function simulate(f, M, t1, t2, n = 4000, rng = Math.random) {
    const cdf = []; let acc = 0;
    for (const q of f.post) { acc += q[2]; cdf.push(acc); }
    const counts = [];
    for (let i = 0; i < n; i++) {
      const u = rng(); let lo = 0, hi = cdf.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
      const [a, p] = f.post[lo];
      const lam = expected(f, a, p, M, t1, t2);
      let k = 0, L = Math.exp(-lam), pp = 1;
      if (lam > 30) k = Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss(rng)));
      else { do { k++; pp *= rng(); } while (pp > L); k--; }
      counts.push(k);
    }
    return counts;
  }
  function gauss(rng) { return Math.sqrt(-2 * Math.log(rng() || 1e-9)) * Math.cos(2 * Math.PI * rng()); }

  // Earliest time (days from now) at which the chance of a damaging shock in the following 24 h drops below tol
  function reentry(f, M, tol, horizon = 400) {
    if (prob(f, M, 0, 1) < tol) return 0;
    let lo = 0, hi = horizon;
    if (prob(f, M, hi, hi + 1) >= tol) return Infinity;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (prob(f, M, mid, mid + 1) < tol) hi = mid; else lo = mid; }
    return hi;
  }
  return { fit, prob, simulate, reentry, MC, params: { B, C, A0, ASD, P0, PSD, TSTART } };
})();
if (typeof module !== 'undefined') module.exports = MODEL;
