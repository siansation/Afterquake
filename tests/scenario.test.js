const test=require('node:test');
const assert=require('node:assert/strict');
const MODEL=require('../src/model.js');
const SHAKE=require('../src/shake.js');
const SCENARIO=require('../src/scenario.js');

const events=[[0,7.5,0,0],[.1,5.2,.1,.1],[1.5,5.8,.2,.2],[9,6.5,.3,.3]];
function snapshot(overrides={}){
  return SCENARIO.capture({sequence:'example',location:{lat:0,lon:0,name:'Town A'},now:1,minutes:1440,
    probability:.08,q:.1,threshold:7,tolerance:.01,building:'local',calibrated:false,
    savedAt:1000,dataVersion:'snapshot-1',gridVersion:'grid-1',modelVersion:'model-1',events,...overrides});
}
function close(a,b,tol=1e-11){assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`)}

test('duration probabilities integrate each complete exposure window and preserve 24-hour behaviour',()=>{
  const f=MODEL.fit(events,.3),cp=SHAKE.compact(f);let last=0;
  for(const minutes of [5,10,30,60,480,1440]){
    const result=SCENARIO.exposure(SHAKE,f,cp,.1,minutes);
    const direct=f.post.reduce((sum,[a,p,w])=>sum+w*-Math.expm1(-MODEL.expected(f,a,p,5,0,minutes/1440)*.1),0);
    close(result.probability,direct);assert.ok(result.probability>last);last=result.probability;
    assert.ok(result.range.low>=0&&result.range.high<=1&&result.range.low<=result.range.high);
  }
  close(last,SHAKE.probQ(f,cp,.1,0,1));
  const short=SCENARIO.exposure(SHAKE,f,cp,.1,10).probability;
  assert.ok(Math.abs(short-last/144)>1e-6,'Short visits must not use linearly scaled 24-hour odds');
});

test('planned start search applies the chosen duration and crosses the same probability limit',()=>{
  const f=MODEL.fit(events,.3),cp=SHAKE.compact(f),tol=.01,q=.1;let last=-1;
  for(const minutes of [5,60,480,1440]){
    const days=SCENARIO.durationDays(minutes),start=SHAKE.reentryQ(f,cp,q,tol,days);
    assert.ok(Number.isFinite(start)&&start>=last);last=start;
    assert.ok(SHAKE.probQ(f,cp,q,start,start+days)<=tol+1e-10);
    if(start>1e-5)assert.ok(SHAKE.probQ(f,cp,q,start-1e-5,start+days-1e-5)>=tol);
  }
  close(last,SHAKE.reentryQ(f,cp,q,tol));
  for(const minutes of [0,-1,1441,NaN,Infinity])assert.throws(()=>SCENARIO.durationDays(minutes),RangeError);
  assert.throws(()=>SHAKE.reentryQ(f,cp,q,tol,0),RangeError);
  assert.throws(()=>SHAKE.reentryQ(f,cp,q,0,1),RangeError);
});

test('duration and probability labels retain useful precision for short exposures',()=>{
  assert.equal(SCENARIO.durationLabel(10),'10 minutes');
  assert.equal(SCENARIO.durationLabel(60),'1 hour');
  assert.equal(SCENARIO.durationLabel(480),'8 hours');
  assert.equal(SCENARIO.durationLabel(90),'1 h 30 min');
  assert.equal(SCENARIO.formatProbability(.00005),'0.005%');
  assert.equal(SCENARIO.formatProbability(0),'0%');
  assert.throws(()=>SCENARIO.formatProbability(NaN),RangeError);
  assert.throws(()=>SCENARIO.formatProbability(-.1),RangeError);
});

test('saved checks contain only past origin times and do not alias mutable inputs',()=>{
  const location={lat:0,lon:0,name:'Town A'},source=events.map(e=>[...e]);
  const saved=snapshot({location,events:source});
  assert.equal(saved.events.length,2);assert.ok(saved.events.every(e=>e[0]<=1));
  source[0][1]=9;location.name='Changed';
  assert.equal(saved.events[0][1],7.5);assert.equal(saved.location.name,'Town A');
  assert.ok(SCENARIO.validSnapshot(JSON.parse(JSON.stringify(saved))));
});

test('unchanged checks and reordered catalogue entries do not invent changes',()=>{
  const before=snapshot(),after=snapshot({events:[...events].reverse(),savedAt:2000});
  const diff=SCENARIO.changes(before,after);
  assert.equal(diff.status,'same');assert.deepEqual(diff.reasons,[]);assert.equal(diff.delta,0);
});

test('elapsed time without new catalogue events is distinguished from earthquake updates',()=>{
  const source=[[0,7.5,0,0],[.1,5.2,.1,.1],[9,8,.2,.2]];
  const diff=SCENARIO.changes(snapshot({events:source}),snapshot({now:2,probability:.04,events:source}));
  assert.ok(diff.reasons.some(r=>/time advanced/.test(r)));
  assert.ok(diff.reasons.some(r=>/No additional catalogue events/.test(r)));
  assert.ok(!diff.reasons.some(r=>/largest M8/.test(r)));
  close(diff.delta,-.04);assert.equal(diff.assumptionsChanged,false);
});

test('forward replay counts newly visible events without using later earthquakes',()=>{
  const diff=SCENARIO.changes(snapshot(),snapshot({now:2,probability:.1}));
  assert.ok(diff.reasons.some(r=>/1 additional catalogue event/.test(r)&&/largest M5.8/.test(r)));
  assert.ok(!diff.reasons.some(r=>/M6.5/.test(r)));
});

test('backwards replay hides events without calling them new or revised',()=>{
  const diff=SCENARIO.changes(snapshot({now:2}),snapshot());
  assert.ok(diff.reasons.some(r=>/backwards/.test(r)));
  assert.ok(!diff.reasons.some(r=>/additional catalogue event|earlier replay time changed/.test(r)));
});

test('revisions to already-known tuples and refreshed data are explicitly identified',()=>{
  const changed=events.map(e=>[...e]);changed[1][1]=5.3;
  const diff=SCENARIO.changes(snapshot(),snapshot({events:changed,dataVersion:'snapshot-2'}));
  assert.ok(diff.reasons.some(r=>/earlier replay time changed/.test(r)));
  assert.ok(diff.reasons.some(r=>/snapshot was refreshed/.test(r)));
});

test('location and setting changes are marked as different scenarios',()=>{
  const diff=SCENARIO.changes(snapshot(),snapshot({location:{lat:.1,lon:.1,name:'Town B'},minutes:10,building:'7',calibrated:true,threshold:6,probability:.03}));
  assert.equal(diff.assumptionsChanged,true);
  for(const phrase of ['Location changed','Exposure changed','building assumption','shaking equation','intensity threshold']){
    assert.ok(diff.reasons.some(r=>r.includes(phrase)),phrase);
  }
  assert.equal(SCENARIO.changes(snapshot(),snapshot({threshold:6})).assumptionsChanged,true);
});

test('risk-limit changes affect the decision threshold rather than the probability',()=>{
  const diff=SCENARIO.changes(snapshot(),snapshot({tolerance:.001}));
  assert.equal(diff.delta,0);assert.equal(diff.assumptionsChanged,true);
  assert.ok(diff.reasons.some(r=>/not the shaking probability/.test(r)));
});

test('fitted model and ground-data changes are distinguished from catalogue changes',()=>{
  const diff=SCENARIO.changes(snapshot(),snapshot({modelVersion:'model-2',gridVersion:'grid-2'}));
  assert.ok(diff.reasons.some(r=>/fitted coefficient/.test(r)));
  assert.ok(diff.reasons.some(r=>/ground-failure data/.test(r)));
  assert.ok(!diff.reasons.some(r=>/Catalogue entries/.test(r)));
});

test('incompatible, corrupted and different-sequence saved checks reset gracefully',()=>{
  for(const old of [null,{},snapshot({sequence:'other'}),{...snapshot(),version:99},
    {...snapshot(),events:[[9,8,0,0]]},{...snapshot(),probability:'bad'}]){
    assert.equal(SCENARIO.changes(old,snapshot()).status,'missing');
  }
  assert.throws(()=>SCENARIO.changes(snapshot(),{}),RangeError);
});

test('comparison distance handles identical pins and the date line',()=>{
  close(SCENARIO.distanceKm({lat:0,lon:0},{lat:0,lon:0}),0);
  close(SCENARIO.distanceKm({lat:0,lon:179.9},{lat:0,lon:-179.9}),22.2389853289,1e-8);
});
