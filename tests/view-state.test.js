const test=require('node:test');
const assert=require('node:assert/strict');
const VIEW=require('../src/view-state.js');
const SPOKEN=require('../src/spoken.js');
function view(overrides={}){return {v:1,event:{kind:'case',id:'turkey'},a:{lat:37.5,lon:36.9,name:'Town A'},b:{lat:37.7,lon:37.1,name:'Town B'},
  minutes:10,building:'7',tolerance:.01,calibrated:false,at:'2023-02-07T12:34:56.789Z',dataAt:'2026-10-24T17:32:53.517Z',...overrides}}
test('sharing round-trips pins, settings and exact absolute time without model outputs',()=>{
  const input=view();const url=VIEW.url('https://afterquake.test/?private=discard#old',input),parsed=VIEW.parse(new URL(url).hash);
  assert.deepEqual(parsed,input);assert.equal(new URL(url).search,'');
  assert.ok(!url.includes('probability'));assert.ok(!url.includes('private'));
  assert.equal(VIEW.parse('#unrelated'),null);
});
test('live links preserve the event ID and normalise date-line coordinates',()=>{
  const input=view({event:{kind:'live',id:'us7000_test'},a:{lat:0,lon:190.3,name:'A & B / 日本'},b:null});
  const parsed=VIEW.parse(VIEW.fragment(input));assert.equal(parsed.event.id,input.event.id);
  assert.ok(Math.abs(parsed.a.lon+169.7)<1e-10);assert.equal(parsed.a.name,input.a.name);
});
test('untrusted links reject unsupported settings, coordinates, IDs and timestamps',()=>{
  for(const invalid of [view({v:2}),view({minutes:0}),view({minutes:11}),view({building:'unknown'}),view({tolerance:.9}),
    view({calibrated:'false'}),view({at:'bad'}),view({event:{kind:'live',id:'https://evil.test'}}),view({a:{lat:100,lon:0,name:'bad'}})]){
    assert.throws(()=>VIEW.clean(invalid));
  }
  assert.throws(()=>VIEW.parse('#view=notJSON'));
  assert.throws(()=>VIEW.parse('#view='+new Array(6001).fill('x').join('')));
  assert.throws(()=>VIEW.url('file:///local/index.html',view()),/hosted app/);
  assert.throws(()=>VIEW.url('javascript:alert(1)',view()));
});
test('spoken summaries prioritise one estimate and actions in at most 60 words',()=>{
  const input={place:'Town A',duration:'10 minutes',probability:'0.005%',date:'7 Feb 2023',magnitude:7.8,
    low:'<0.0001%',high:'1.2%',decision:'Below the limit from next week',time:'12:00 UTC'};
  const text=SPOKEN.summary(input);
  for(const phrase of ['7 Feb 2023','magnitude 7.8','0.005 percent','10 minutes','drop, cover and hold on','If outside','Wait for a building inspection'])assert.ok(text.includes(phrase));
  assert.ok(!/recorded example/i.test(text));
  assert.ok(text.split(/\s+/).length<=60);
  for(const obsolete of ['0.0001','1.2','12:00','next week','posterior','threshold'])assert.ok(!text.includes(obsolete));
  assert.ok(!/safe to enter|go back inside/i.test(text));
});

test('a concise local condition differentiates scenarios without claiming an inspection',()=>{
  const input={place:'Town A',duration:'10 minutes',probability:'0.5%',date:'7 Feb 2023',magnitude:7.8};
  const slopes=SPOKEN.summary({...input,ground:{ls:.1,liq:.2,mmi:8}});
  assert.ok(slopes.includes('Landslide risk was mapped'));assert.ok(!slopes.includes('unstable ground'));
  const soft=SPOKEN.summary({...input,ground:{vs:150,mmi:6}});
  assert.ok(soft.includes('Soft ground'));assert.notEqual(slopes,soft);
  assert.ok(slopes.split(/\s+/).length<=65&&soft.split(/\s+/).length<=65);
  assert.ok(SPOKEN.localContext('6',{ls:.1}).includes('You selected'));
  assert.equal(SPOKEN.localContext('local',{vs:0,mmi:4}),'');
  const observed=SPOKEN.summary({...input,ground:{ls:.1},hazards:['trees']});
  assert.ok(observed.includes('trees'));assert.ok(!observed.includes('Landslide risk'));
});

test('delayed data comes before the estimate and observed hazards change the action',()=>{
  const text=SPOKEN.summary({place:'Town A',duration:'24 hours',probability:'<0.0001%',delayed:true,hazards:['slope']});
  assert.ok(text.indexOf('Updates are delayed')<text.indexOf('estimated chance'));
  assert.ok(text.includes('less than 0.0001 percent'));assert.ok(text.includes('steep slopes'));
  assert.ok(text.split(/\s+/).length<=70);
  assert.ok(SPOKEN.actions(['trees']).some(action=>action.includes('trees')));
});
