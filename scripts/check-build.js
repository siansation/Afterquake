// Static verification of the standalone artifact, without needing a browser.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(!/__([A-Z]+_?)+__/.test(html), 'Unreplaced template placeholder');
const ids = [...html.matchAll(/\bid="([^"\s]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML IDs');
let scripts = 0, data = 0;
const executable = [], datasets = new Map();
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (/type="application\/json"/.test(match[1])) {
    datasets.set(match[1].match(/\bid="([^"]+)"/)[1], JSON.parse(match[2])); data++;
  } else {
    new vm.Script(match[2], { filename: `index.html:inline-${scripts++}` });
    executable.push(match[2]);
  }
}
assert.equal(data, 7);
assert.ok(scripts >= 11, 'Expected bundled map, globe libraries, live loader, globe, model, shaking, validation, scenario and UI scripts');
for (const name of ['LIVE', 'GLOBE']) assert.ok(executable.some(code => new RegExp(`\\bconst ${name}\\s*=`).test(code)), `Missing bundled ${name}`);
assert.ok(executable.some(code => /geoOrthographic/.test(code)), 'Missing bundled d3-geo');
assert.deepEqual(Object.keys(datasets.get('d-world')), ['land110', 'countries110', 'land50', 'countries50'], 'World outlines missing');
assert.ok(datasets.get('d-towns').length > 40000, 'World towns missing');
assert.ok(!/<script[^>]+src=/.test(html), 'Standalone app still needs a remote script');
// Design guard (docs/DESIGN.md): the app's own styles, markup and scripts must not bring back stock AI-template patterns.
// Scans whole source files (every <style> block, inline styles, JS-built markup, canvas drawing), not just one block.
// Leaflet's CSS is only a placeholder in the template, so it is not scanned.
for (const file of ['src/template.html', 'src/globe.js', 'src/planner.js']) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  for (const [re, what] of [[/text-transform\s*:\s*uppercase/i, 'uppercase eyebrow labels'], [/letter-spacing/i, 'tracked-out labels'],
    [/monospace|--mono/i, 'monospace for non-code text'], [/gradient\(|create(Linear|Radial)Gradient/i, 'decorative gradients'],
    [/backdrop-filter/i, 'glass panels'], [/@keyframes|animation\s*:/i, 'decorative animation'],
    [/ · |▶|◀/, '"A · B" meta strings or glyph buttons']]) assert.ok(!re.test(src), `Design guard: no ${what} in ${file} (see docs/DESIGN.md)`);
}
for (const id of ['exposure', 'comparisonTown', 'pickComparison', 'comparisonResult', 'saveCheck', 'changesResult']) {
  assert.ok(ids.includes(id), `Missing planning control ${id}`);
}
// Execute the bundled numerical modules in a browser-like global scope with no
// CommonJS require/module. Syntax checks alone cannot catch a missed build-time
// replacement of the fitted soil coefficient or a stale generated model module.
const browser = vm.createContext({});
for (const name of ['MODEL', 'SHAKE', 'VALIDATION', 'SCENARIO']) {
  const source = executable.find(code => new RegExp(`\\bconst ${name}\\s*=`).test(code));
  assert.ok(source, `Missing bundled ${name}`);
  assert.ok(!/\brequire\s*\(/.test(source), `${name} still needs CommonJS in the browser`);
  new vm.Script(source).runInContext(browser);
}
const fit = require('../data/site-term-fit.json');
assert.equal(vm.runInContext('SHAKE.K', browser), fit.k, 'Bundled soil term is stale');
assert.deepEqual(datasets.get('d-data'), require('../data/sequences.json'), 'Bundled catalogue is stale');
const sample = datasets.get('d-data').sequences[0];
browser.sampleEvents = sample.events;
const bundled = vm.runInContext('MODEL.prob(MODEL.fit(sampleEvents,1),5,0,7)', browser);
const MODEL = require('../src/model.js');
assert.equal(bundled, MODEL.prob(MODEL.fit(sample.events, 1), 5, 0, 7), 'Browser and Node forecasts differ');
const SHAKE = require('../src/shake.js'), SCENARIO = require('../src/scenario.js');
const f = MODEL.fit(sample.events, 1), cp = SHAKE.compact(f);
const shortExposure = vm.runInContext('(()=>{const f=MODEL.fit(sampleEvents,1);return SCENARIO.exposure(SHAKE,f,SHAKE.compact(f),.1,10).probability})()', browser);
assert.equal(shortExposure, SCENARIO.exposure(SHAKE, f, cp, .1, 10).probability, 'Bundled short-exposure estimate differs');
console.log(`Standalone build verified: ${scripts} scripts parsed, ${data} datasets decoded; bundled models executed and matched source data.`);
