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
assert.equal(data, 5);
assert.ok(scripts >= 5, 'Expected bundled map, model, shaking, validation and UI scripts');
assert.ok(!/<script[^>]+src=/.test(html), 'Standalone app still needs a remote script');
// Execute the bundled numerical modules in a browser-like global scope with no
// CommonJS require/module. Syntax checks alone cannot catch a missed build-time
// replacement of the fitted soil coefficient or a stale generated model module.
const browser = vm.createContext({});
for (const name of ['MODEL', 'SHAKE', 'VALIDATION']) {
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
console.log(`Standalone build verified: ${scripts} scripts parsed, ${data} datasets decoded; bundled models executed and matched source data.`);
