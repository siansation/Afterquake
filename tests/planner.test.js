const test=require('node:test');
const assert=require('node:assert/strict');
const SHAKE=require('../src/shake.js');
const SCENARIO=require('../src/scenario.js');
const {harness,storageKey}=require('../test-support/planner-harness.js');


test('choosing comparison B leaves A fixed and compares the same intensity and duration',()=>{
  const h=harness();h.node('pickComparison').onclick();
  assert.equal(h.node('pickComparison').attributes['aria-pressed'],'true');
  assert.equal(h.run('chooseComparison(.1,.2,"Town B")'),true);
  assert.equal(h.ctx.loc.name,'Town A');assert.equal(h.ctx.loc.lat,0);assert.equal(h.ctx.loc.lon,0);
  assert.equal(h.node('pickComparison').attributes['aria-pressed'],'false');
  assert.equal(h.run('comparisonLayer.items.length'),1);
  const qb=SHAKE.q([0,0],.2*111.32,.1*110.57,380,7,false);
  const expected=SCENARIO.formatProbability(SHAKE.probQ(h.ctx.cur.f,h.ctx.cur.cp,qb,0,1));
  const html=h.node('comparisonResult').innerHTML;
  assert.ok(html.includes('A: Town A')&&html.includes('B: Town B'));
  assert.ok(html.includes('both use intensity <b>7+</b> and the same replay time'));
  assert.ok(html.includes(`<td>${expected}</td>`));
});

test('comparison town search, cancellation and clearing use independent controls',()=>{
  const h=harness();h.node('comparisonTown').value='Town B';h.node('comparisonTown').onchange();
  assert.equal(h.run('comparisonLocation.name'),'Town B');
  assert.equal(h.ctx.loc.name,'Town A');
  h.node('pickComparison').onclick();h.node('pickComparison').onclick();
  assert.equal(h.run('comparisonPicking'),false);
  h.node('clearComparison').onclick();
  assert.equal(h.run('comparisonLocation'),null);assert.equal(h.run('comparisonLayer.items.length'),0);
  assert.equal(h.node('clearComparison').disabled,true);
});

test('comparison selection rejects unavailable grid data',()=>{
  const h=harness();assert.equal(h.run('chooseComparison(30,30,"Outside")'),false);
  assert.equal(h.run('comparisonLocation'),null);
  assert.ok(h.node('comparisonStatus').textContent.includes('No ground data'));
});

test('saving, comparing and reloading a check preserve the original replay baseline',()=>{
  const h=harness();h.node('saveCheck').onclick();
  const saved=h.storage.get(storageKey),record=JSON.parse(saved).example;
  assert.equal(record.now,1);assert.equal(record.events.length,2);
  assert.ok(h.node('changesFeedback').textContent.includes('saved in this browser'));
  h.advance(2);h.run('renderChanges()');
  assert.ok(h.node('changesResult').innerHTML.includes('additional catalogue event'));
  assert.equal(JSON.parse(h.storage.get(storageKey)).example.now,1,'Rendering must not overwrite the baseline');
  const reloaded=harness({stored:saved});reloaded.advance(2);reloaded.run('renderChanges()');
  assert.ok(reloaded.node('changesResult').innerHTML.includes('largest M5.8'));
  reloaded.node('forgetCheck').onclick();
  assert.equal(JSON.parse(reloaded.storage.get(storageKey)).example,undefined);
  assert.equal(reloaded.node('forgetCheck').disabled,true);
});

test('blocked storage falls back to session-only checks without crashing',()=>{
  const h=harness({blocked:true});h.node('saveCheck').onclick();
  assert.ok(h.node('changesFeedback').textContent.includes('this session'));
  h.advance(2);h.run('renderChanges()');
  assert.ok(h.node('changesResult').innerHTML.includes('additional catalogue event'));
  h.node('forgetCheck').onclick();assert.equal(h.node('forgetCheck').disabled,true);
});

test('corrupted persisted records reset rather than entering the comparison',()=>{
  for(const stored of ['not JSON','null','{"example":{"version":99}}']){
    const h=harness({stored});h.run('renderChanges()');
    assert.equal(h.node('forgetCheck').disabled,true);
    assert.ok(h.node('changesResult').innerHTML.includes('Save a check for spot A'));
  }
});

test('place names are escaped in comparison HTML and saved-check summaries',()=>{
  const h=harness(),unsafe='<img src=x onerror=alert(1)>';
  h.ctx.unsafeName=unsafe;h.run('chooseComparison(.1,.2,unsafeName)');
  assert.ok(!h.node('comparisonResult').innerHTML.includes(unsafe));
  assert.ok(h.node('comparisonResult').innerHTML.includes('&lt;img'));
  h.ctx.loc.name=unsafe;h.node('saveCheck').onclick();h.advance(2);h.run('renderChanges()');
  assert.ok(!h.node('changesResult').innerHTML.includes(unsafe));
  assert.ok(h.node('changesResult').innerHTML.includes('&lt;img'));
});
