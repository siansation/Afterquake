// Map shading uses the same 200-point probability interpolation as before.
// Yield between short batches so dragging, typing and navigation can continue.
// An obsolete request stops before sampling any more cells or publishing a map.
const HEATMAP = (() => {
  async function build({ cols, rows, sample, probability, isCurrent = () => true,
    yieldControl = () => new Promise(resolve => requestAnimationFrame(resolve)),
    now = () => performance.now(), budget = 8 }) {
    if (!isCurrent()) return null;
    const Q = new Float64Array(cols * rows), P = new Float32Array(Q.length);
    let qMin = Infinity, qMax = 0, deadline = now() + budget;
    for (let i = 0; i < Q.length; i++) {
      const q = sample(i); Q[i] = q;
      if (q > 0) { qMin = Math.min(qMin, q); qMax = Math.max(qMax, q); }
      if (now() >= deadline) {
        await yieldControl();
        if (!isCurrent()) return null;
        deadline = now() + budget;
      }
    }
    if (qMax > 0) {
      const n = 200, l0 = Math.log(qMin), dl = (Math.log(qMax) - l0) / (n - 1) || 1;
      const table = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        table[i] = probability(Math.exp(l0 + i * dl));
        if (now() >= deadline) {
          await yieldControl();
          if (!isCurrent()) return null;
          deadline = now() + budget;
        }
      }
      for (let i = 0; i < Q.length; i++) {
        if (!(Q[i] > 0)) continue;
        const x = Math.min(n - 1, (Math.log(Q[i]) - l0) / dl);
        const j = Math.min(n - 2, Math.floor(x)), t = x - j;
        P[i] = table[j] + (table[j + 1] - table[j]) * t;
      }
    }
    return isCurrent() ? { cols, rows, P } : null;
  }
  return { build };
})();
if (typeof module !== 'undefined') module.exports = HEATMAP;
