const test=require('node:test');
const assert=require('node:assert/strict');
const MODEL=require('../src/model.js');
const SHAKE=require('../src/shake.js');
const SCENARIO=require('../src/scenario.js');

const events=[[0,7.5,0,0],[.1,5.2,.1,.1],[1.5,5.8,.2,.2],[9,6.5,.3,.3]];
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

test('geographic distance handles identical places and the date line',()=>{
  close(SCENARIO.distanceKm({lat:0,lon:0},{lat:0,lon:0}),0);
  close(SCENARIO.distanceKm({lat:0,lon:179.9},{lat:0,lon:-179.9}),22.2389853289,1e-8);
});
