const test = require('node:test');
const assert = require('node:assert/strict');
const MODEL = require('../src/model.js');
const SHAKE = require('../src/shake.js');
const VALIDATION = require('../src/validation.js');
const D = require('../data/sequences.json');
const EX = require('../data/ground-failure-and-pager.json');

function close(actual, expected, tolerance = 1e-11) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (tolerance ${tolerance})`);
}
function seeded(seed = 123456) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('point forecast preserves all posterior probability, across all 13 sequences', () => {
  for (const s of D.sequences) for (const now of [1 / 24, .3, 1, 7, 30]) {
    if (now > s.daysAvailable) continue;
    const f = MODEL.fit(s.events, now), cp = SHAKE.compact(f);
    close(cp.reduce((sum, x) => sum + x[0], 0), 1);
    assert.equal(cp.length, f.post.length);
    for (const days of [1, 7, 30]) {
      close(SHAKE.probQ(f, cp, 1, 0, days), MODEL.prob(f, 5, 0, days));
      for (const q of [.001, .1, .8]) {
        const direct = f.post.reduce((sum, [a, p, w]) => sum + w *
          -Math.expm1(-MODEL.expected(f, a, p, 5, 0, days) * q), 0);
        close(SHAKE.probQ(f, cp, q, 0, days), direct);
      }
    }
  }
});

test('regression: one hour after Türkiye, the prior mixture is not halved', () => {
  const s = D.sequences.find(s => s.key === 'turkey');
  const f = MODEL.fit(s.events, 1 / 24), cp = SHAKE.compact(f);
  close(SHAKE.probQ(f, cp, .1, 0, 1), .517652, .0001);
  const oldSlice = [...cp].sort((a, b) => b[0] - a[0]).slice(0, 160);
  assert.ok(oldSlice.reduce((s, x) => s + x[0], 0) < .48);
  assert.ok(SHAKE.probQ(f, oldSlice, .1, 0, 1) < .25);
});

test('cached rates change with the forecast time even when the posterior array is reused', () => {
  const f = MODEL.fit(D.sequences[0].events, 1), cp = SHAKE.compact(f);
  const later = { ...f, now: f.now + 10 };
  const earlyProbability = SHAKE.probQ(f, cp, .1, 0, 7);
  const laterProbability = SHAKE.probQ(later, cp, .1, 0, 7);
  const direct = cp.reduce((sum, [w, a, p]) => sum + w *
    -Math.expm1(-MODEL.expected(later, a, p, 5, 0, 7) * .1), 0);
  close(laterProbability, direct);
  assert.ok(laterProbability < earlyProbability);
  close(SHAKE.probQ(f, cp, .1, 0, 7), earlyProbability);
});

test('future events never enter the fitted rate posterior', () => {
  for (const s of D.sequences) {
    const now = Math.min(1, s.daysAvailable);
    const earlier = s.events.filter(e => e[0] <= now);
    assert.deepEqual(MODEL.fit(s.events, now), MODEL.fit(earlier, now));
  }
});

test('new larger shock restarts the prototype clock only once observed', () => {
  const events = [[0, 6], [.1, 5], [1, 7], [1.1, 5.5]];
  assert.equal(MODEL.fit(events, .5).Mm, 6);
  const after = MODEL.fit(events, 1.2);
  assert.equal(after.Mm, 7);
  assert.equal(after.tm, 1);
  assert.equal(after.n, 1);
  assert.throws(() => MODEL.fit(events, -1), RangeError);
  assert.throws(() => MODEL.fit([], 1), RangeError);
});

test('Omori integral matches independent numerical integration and stays stable near p=1', () => {
  const start = .1, end = 7, steps = 20000, h = (end - start) / steps;
  for (const p of [.8, 1, 1 + 1e-9, 1.4]) {
    let sum = 0;
    for (let i = 0; i <= steps; i++) sum += (i === 0 || i === steps ? 1 : i % 2 ? 4 : 2) * (start + i * h + .018) ** -p;
    close(MODEL.integral(start, end, p), sum * h / 3, 1e-10);
  }
  assert.equal(MODEL.integral(1, 1, 1), 0);
  assert.ok(MODEL.integral(1e6, 1e6 + 1e-7, 1 + 1e-8) > 0);
});

test('90% parameter interval is an equal-tail range, including a zero-risk case', () => {
  const f = MODEL.fit(D.sequences[0].events, 1 / 24), cp = SHAKE.compact(f);
  const range = SHAKE.parameterRange(f, cp, .1, 0, 1);
  assert.ok(range.low > 0 && range.high < 1 && range.low < range.high);
  const weightsBelow = cutoff => cp.reduce((sum, [w, a, p]) => sum +
    (-Math.expm1(-MODEL.expected(f, a, p, 5, 0, 1) * .1) < cutoff ? w : 0), 0);
  assert.ok(weightsBelow(range.low) <= .05 + 1e-11);
  assert.ok(weightsBelow(range.high) <= .95 + 1e-11);
  assert.deepEqual(SHAKE.parameterRange(f, cp, 0, 0, 1), { low: 0, high: 0 });
});

test('threshold crossing is the first following 24-hour window below the chosen limit', () => {
  const f = MODEL.fit(D.sequences[0].events, 1), cp = SHAKE.compact(f);
  const q = .1, tol = .01, wait = SHAKE.reentryQ(f, cp, q, tol);
  assert.ok(wait > 0 && Number.isFinite(wait));
  assert.ok(SHAKE.probQ(f, cp, q, wait, wait + 1) <= tol + 1e-11);
  assert.ok(SHAKE.probQ(f, cp, q, wait - 1e-5, wait + 1 - 1e-5) >= tol);
  assert.equal(SHAKE.reentryQ(f, cp, 0, tol), 0);
  assert.equal(SHAKE.reentryQ(f, cp, q, 1e-12), Infinity);
});

test('Monte Carlo monthly and weekly frequencies match the displayed formula', () => {
  const f = MODEL.fit(D.sequences[0].events, .3), cp = SHAKE.compact(f);
  for (const calibrated of [false, true]) {
    const mark = SHAKE.marks([0, 0, 15, 5, -10, 20], 5, 3, 400, 7, calibrated);
    assert.ok(mark.damageM6 <= mark.damage && mark.damageM6 <= mark.m6);
    const n = 30000, sim = SHAKE.simulateFutures(f, cp, mark, 30, n, seeded(calibrated ? 23 : 7));
    for (const days of [1, 7, 30]) {
      const expected = SHAKE.probQ(f, cp, mark.damage, 0, days);
      const actual = sim.rows.filter(row => row.slice(0, days).includes(2)).length / n;
      close(actual, expected, 5 * Math.sqrt(expected * (1 - expected) / n) + 1 / n);
    }
  }
});

test('grey M6+ marks also follow the same process when local shaking is excluded', () => {
  const f = MODEL.fit(D.sequences[0].events, 1), cp = SHAKE.compact(f);
  const mark = SHAKE.marks([0, 0], 10, 0, 760, 7, false);
  close(mark.m6, (.1 - 10 ** -3.5) / (1 - 10 ** -3.5));
  mark.damage = 0; mark.damageM6 = 0;
  const n = 20000, sim = SHAKE.simulateFutures(f, cp, mark, 7, n, seeded(41));
  const expected = SHAKE.probQ(f, cp, mark.m6, 0, 7);
  close(sim.rows.filter(row => row.includes(1)).length / n, expected,
    5 * Math.sqrt(expected * (1 - expected) / n) + 1 / n);
  assert.equal(sim.hits, 0);
  assert.throws(() => SHAKE.simulateFutures(f, cp.slice(0, 160), mark), /sum to one/);
});

test('Allen 2012 coefficients match independent reference values', () => {
  // Values evaluated from the coefficients in GEM's AllenEtAl2012Rhypo implementation.
  close(SHAKE.mu(6, 10), 7.248807863969799, 1e-10);
  close(SHAKE.mu(7, 100), 5.663266182504224, 1e-10);
  close(SHAKE.sig(22.9), 1.005);
  assert.equal(SHAKE.K, require('../data/site-term-fit.json').k);
  close(SHAKE.site(760), 0);
  assert.ok(SHAKE.site(180) > 0);
  assert.ok(SHAKE.q([0, 0], 5, 0, 180, 7, false) > SHAKE.q([0, 0], 5, 0, 760, 7, false));
});

test('validation excludes incomplete windows and holds out whole sequences for its reference', () => {
  const rows = [
    { sequence: 'a', magnitude: 5, probability: .8, occurred: true },
    { sequence: 'a', magnitude: 5, probability: .6, occurred: true },
    { sequence: 'b', magnitude: 5, probability: .2, occurred: false }
  ];
  const st = VALIDATION.summarize(rows, 5);
  close(st.heldOutBrier, 1); // each other-sequence baseline is exactly wrong
  close(st.brier, (.04 + .16 + .04) / 3);
  // Synthetic coverage boundaries keep this regression valid after a data refresh.
  const sequence = { key: 'coverage', events: [[0, 7], [.7, 5.2]], daysAvailable: 7.49 };
  assert.equal(VALIDATION.backtest([sequence], MODEL).length, 0);
  const complete = VALIDATION.backtest([{ ...sequence, daysAvailable: 7.5 }], MODEL);
  assert.equal(complete.length, 2);
  assert.equal(complete.find(r => r.magnitude === 5).occurred, true);
  assert.equal(complete.find(r => r.magnitude === 6).occurred, false);
  const all = VALIDATION.backtest(D.sequences, MODEL);
  assert.ok(VALIDATION.summarize(all, 5).forecasts > 0);
  for (const r of all) assert.ok(r.day + 7 <= D.sequences.find(s => s.key === r.sequence).daysAvailable);
});

test('embedded USGS grids have compatible dimensions and valid forecast inputs', () => {
  for (const s of D.sequences) {
    assert.ok(s.events.some(e => e[0] === 0 && e[1] === s.M), `${s.key}: missing mainshock`);
    for (const e of s.events) assert.ok(e.length === 4 && e.every(Number.isFinite));
    const g = D.shakemaps[s.key], size = g.nc * g.nr;
    assert.equal(Buffer.from(g.mmi, 'base64').length, size);
    assert.equal(Buffer.from(g.vs30, 'base64').length, size);
    for (const key of ['liq', 'ls']) if (EX[s.key]?.[key]) assert.equal(Buffer.from(EX[s.key][key].b, 'base64').length, size);
    assert.ok(g.dlat > 0 && g.dlon > 0);
    assert.ok(Number.isFinite(Date.parse(s.t0)) && Number.isFinite(Date.parse(g.processed)));
  }
});
