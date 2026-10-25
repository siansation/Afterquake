const test = require('node:test');
const assert = require('node:assert/strict');
const MODEL = require('../src/model.js');
const SHAKE = require('../src/shake.js');
const FORECAST_CACHE = require('../src/forecast-cache.js');
const HEATMAP = require('../src/heatmap.js');

test('display-only changes reuse the complete fit without changing probabilities', () => {
  const events = [[0, 7.8, 37, 37], [.1, 5.5, 37, 37]], cache = FORECAST_CACHE.create(MODEL, SHAKE);
  const first = cache.at(events, 1), second = cache.at(events, 1);
  assert.equal(first, second);
  assert.equal(first.cp.length, first.f.post.length);
  const direct = MODEL.fit(events, 1);
  for (const days of [1, 7, 30]) {
    assert.equal(SHAKE.probQ(first.f, first.cp, .15, 0, days), SHAKE.probQ(direct, SHAKE.compact(direct), .15, 0, days));
  }
  assert.notEqual(cache.at(events, 2).f, first.f, 'A different replay time needs a new fit');
});

test('revised catalogues and explicit invalidation cannot retain stale posteriors', () => {
  const events = [[0, 7, 0, 0], [.1, 5, 0, 0]], cache = FORECAST_CACHE.create(MODEL, SHAKE);
  const first = cache.at(events, 1);
  const revised = events.map(e => [...e]); revised[1][1] = 6;
  assert.notEqual(cache.at(revised, 1).f, first.f, 'Same-count revisions still change the fit');
  revised[1][1] = 7.5; cache.clear();
  const latest = cache.at(revised, 1);
  assert.equal(latest.f.Mm, 7.5, 'Explicit invalidation also covers in-place revisions');
});

test('batched map shading agrees with the exact probabilities at both lookup endpoints', async () => {
  const f = MODEL.fit([[0, 7.8, 0, 0]], 1), cp = SHAKE.compact(f);
  const values = [0, 1e-8, .001, .02, .2, 1]; let ticks = 0, yields = 0;
  const result = await HEATMAP.build({ cols: 3, rows: 2, sample: i => values[i],
    probability: q => SHAKE.probQ(f, cp, q, 0, 7), now: () => ticks++, budget: 3,
    yieldControl: async () => { yields++; } });
  assert.ok(yields > 0, 'Long calculations must leave time for browser input');
  assert.equal(result.P[0], 0);
  for (let i = 1; i < values.length; i++) {
    const exact = SHAKE.probQ(f, cp, values[i], 0, 7);
    assert.ok(Math.abs(result.P[i] - exact) < .001, `Cell ${i} differs from the full posterior`);
  }
  for (const i of [1, 5]) assert.equal(result.P[i], Math.fround(SHAKE.probQ(f, cp, values[i], 0, 7)));
});

test('navigation cancels obsolete map work before more cells are sampled', async () => {
  let current = true, samples = 0, ticks = 0;
  const result = await HEATMAP.build({ cols: 100, rows: 100, sample: () => { samples++; return .1; },
    probability: q => q, isCurrent: () => current, now: () => ticks++, budget: 3,
    yieldControl: async () => { current = false; } });
  assert.equal(result, null);
  assert.ok(samples < 10000);
});

test('empty and constant map fields remain finite', async () => {
  for (const q of [0, .1]) {
    const result = await HEATMAP.build({ cols: 2, rows: 2, sample: () => q, probability: x => x,
      now: () => 0 });
    assert.deepEqual([...result.P], Array(4).fill(Math.fround(q)));
  }
});
