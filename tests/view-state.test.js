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
test('saved setups can produce views, including the optional second pin',()=>{
  const input=view({event:{kind:'live',id:'usTest'}});
  const saved={sequence:'live:usTest',location:input.a,comparison:input.b,minutes:input.minutes,building:input.building,
    tolerance:input.tolerance,calibrated:input.calibrated,at:input.at,dataVersion:input.dataAt};
  assert.deepEqual(VIEW.fromCheck(saved),input);
});
test('spoken summary uses supplied figures verbatim, warns early and includes no building clearance',()=>{
  const s=SPOKEN.summary({place:'Town A',earthquake:'Test earthquake',time:'12:00 UTC',duration:'10 minutes',probability:'0.005%',low:'<0.0001%',high:'1.2%',
    decision:'The model is above the chosen limit.',freshness:'Updates are delayed. Using last successful data.'});
  for(const text of ['0.005 percent','less than 0.0001 percent','1.2 percent','10 minutes','12:00 UTC','Building entry needs an inspection'])assert.ok(s.includes(text));
  assert.ok(s.indexOf('Updates are delayed')<s.indexOf('estimated chance'));
  assert.ok(!/safe to enter|go back inside/i.test(s));
});
