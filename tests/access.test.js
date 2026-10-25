const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,storageKey}=require('../test-support/planner-harness.js');
const VIEW=require('../src/view-state.js');
function shared(){return {v:1,event:{kind:'case',id:'example'},a:{lat:0,lon:0,name:'Town A'},b:{lat:.1,lon:.2,name:'Town B'},
  minutes:10,building:'7',tolerance:.001,calibrated:true,at:'2023-02-06T12:34:56.789Z',dataAt:'recorded'}}

test('share copies a validated URL with both pins and exact selected time',async()=>{
  let copied;const h=harness({access:true,clipboard:{writeText:async value=>{copied=value}},href:'https://afterquake.test/?discard=secret'});
  h.run('chooseComparison(.1,.2,"Town B")');await h.node('shareView').onclick();
  const state=VIEW.parse(new URL(copied).hash);
  assert.equal(state.a.name,'Town A');assert.equal(state.b.name,'Town B');assert.equal(state.at,h.ctx.cur.nowDate.toISOString());
  assert.equal(new URL(copied).search,'');assert.ok(h.node('shareStatus').textContent.includes('copied'));
});
test('clipboard denial gives manual copying, and standalone files explain the hosted requirement',async()=>{
  const h=harness({access:true,clipboard:{writeText:async()=>{throw new Error('denied')}}});await h.node('shareView').onclick();
  assert.equal(h.node('shareURL').selected,true);assert.ok(h.node('shareStatus').textContent.includes('Copy the selected link'));
  const file=harness({access:true,href:'file:///example/index.html'});await file.node('shareView').onclick();
  assert.ok(file.node('shareStatus').textContent.includes('hosted app'));
});
test('restoring a saved setup restores A/B and settings but keeps the current time',()=>{
  const h=harness({access:true});h.node('exposure').value='10';h.ctx.update();h.run('chooseComparison(.1,.2,"Town B")');h.node('saveCheck').onclick();
  h.ctx.loc={lat:1,lon:1,name:'Elsewhere'};h.node('exposure').value='480';h.node('bld').value='9';h.node('shk').value='1';h.ctx.setTol('.1');h.advance(2);
  const currentTime=h.ctx.cur.nowDate.toISOString();h.node('restoreCheck').onclick();
  assert.equal(h.ctx.loc.name,'Town A');assert.equal(h.run('comparisonLocation.name'),'Town B');
  assert.equal(h.node('exposure').value,'10');assert.equal(h.node('bld').value,'local');assert.equal(h.node('shk').value,'0');assert.equal(h.ctx.cur.tol,.01);
  assert.equal(h.ctx.cur.nowDate.toISOString(),currentTime);assert.equal(h.ctx.replayTimeOverride,null);
  assert.ok(h.node('changesFeedback').textContent.includes('current forecast time was kept'));
  assert.equal(JSON.parse(h.storage.get(storageKey)).example.now,1);
});
test('legacy checks restore without an absolute timestamp or comparison pin',()=>{
  const first=harness();first.node('saveCheck').onclick();const old=JSON.parse(first.storage.get(storageKey));
  delete old.example.at;delete old.example.origin;delete old.example.comparison;
  const h=harness({access:true,stored:JSON.stringify(old)});h.advance(2);const time=h.ctx.cur.nowDate.toISOString();
  h.node('restoreCheck').onclick();assert.equal(h.ctx.cur.nowDate.toISOString(),time);assert.equal(h.run('comparisonLocation'),null);
});
test('restoration validates every pin before applying any settings',()=>{
  const first=harness();first.node('saveCheck').onclick();const saved=JSON.parse(first.storage.get(storageKey));
  saved.example.comparison={lat:30,lon:30,name:'Unavailable'};saved.example.minutes=10;
  const h=harness({access:true,stored:JSON.stringify(saved)});h.node('restoreCheck').onclick();
  assert.equal(h.node('exposure').value,'1440');assert.ok(h.node('changesFeedback').textContent.includes('outside the current shaking grid'));
});
test('opening a shared case freezes the requested UTC time and applies the two-pin view',async()=>{
  const view=shared(),h=harness({access:true,hash:VIEW.fragment(view)});
  assert.equal(await h.run('openSharedView()'),true);
  assert.equal(h.ctx.cur.nowDate.toISOString(),view.at);assert.equal(h.ctx.replayTimeOverride,Date.parse(view.at));
  assert.equal(h.node('exposure').value,'10');assert.equal(h.node('bld').value,'7');assert.equal(h.run('comparisonLocation.name'),'Town B');
  assert.ok(h.node('sharedNotice').textContent.includes('Recalculated'));
});
test('bad links and missing case studies fail visibly without changing the setup',async()=>{
  for(const hash of ['#view=invalid',VIEW.fragment({...shared(),event:{kind:'case',id:'missing'}})]){
    const h=harness({access:true,hash});assert.equal(await h.run('openSharedView()'),false);
    assert.equal(h.node('sharedNotice').hidden,false);assert.equal(h.node('exposure').value,'1440');assert.equal(h.ctx.loc.name,'Town A');
  }
});
test('speech reads calculated captions, supports voice/speed and stops on forecast changes',()=>{
  const h=harness({access:true});h.node('summaryVoice').value='en-voice';h.node('summarySpeed').value='.75';h.node('readSummary').onclick();
  const first=h.synth.calls.at(-1);assert.equal(first.text,h.node('spokenText').textContent);assert.equal(first.voice.voiceURI,'en-voice');assert.equal(first.rate,.75);
  assert.equal(h.node('stopSummary').disabled,false);
  h.ctx.cur.exposure.probability=.1234;h.run('updateSpokenSummary()');
  assert.ok(h.synth.cancelled>0);assert.equal(h.node('stopSummary').disabled,true);assert.ok(h.node('speechStatus').textContent.includes('forecast changed'));
  h.node('readSummary').onclick();first.onend();assert.equal(h.node('stopSummary').disabled,false,'A cancelled older utterance must not stop a new one');
  h.synth.calls.at(-1).onend();assert.equal(h.node('stopSummary').disabled,true);
});
test('unsupported speech retains the text summary and disables audio',()=>{
  const h=harness({access:true,speech:false});h.run('updateSpokenSummary()');
  assert.equal(h.node('readSummary').disabled,true);assert.ok(h.node('speechStatus').textContent.includes('unavailable'));
  assert.ok(h.node('spokenText').textContent.includes('estimated chance'));
});
test('late device voices refresh safely and non-English voices are not mislabelled',()=>{
  const h=harness({access:true});assert.ok(!h.node('summaryVoice').innerHTML.includes('German voice'));
  h.synth.voices=[{name:'<img src=x>',voiceURI:'new',lang:'en-US'}];h.synth.listeners.voiceschanged();
  assert.ok(h.node('summaryVoice').innerHTML.includes('&lt;img'));assert.ok(!h.node('summaryVoice').innerHTML.includes('<img'));
});
test('stale data warnings precede figures and navigating away cancels speech',()=>{
  const h=harness({access:true});h.ctx.S.live=true;h.ctx.S.fetchedAt='2020-01-01T00:00:00Z';h.ctx.S.refreshError='offline';h.node('readSummary').onclick();
  const text=h.synth.calls.at(-1).text;assert.ok(text.indexOf('Updates are delayed')<text.indexOf('estimated chance'));
  h.events.pagehide();assert.equal(h.node('stopSummary').disabled,true);
});

// ElevenLabs path: only when the hosted /api/speak route says it is configured.
function cloudGlobals({fail=false,translated=true}={}){
  const posts=[],audios=[];
  class FakeAudio{constructor(src){this.src=src;this.paused=true;audios.push(this)}play(){this.paused=false;return Promise.resolve()}pause(){this.paused=true}}
  const fetch=async(url,init={})=>{
    if(!init.method)return {ok:true,json:async()=>({configured:true,languages:[{code:'en',name:'English'},{code:'tr',name:'Turkish'},{code:'zh',name:'Chinese'}]})};
    posts.push(JSON.parse(init.body));
    if(fail)return {ok:false,json:async()=>({error:'Voice credits have run out on this server.'})};
    const chinese=posts.at(-1).lang==='zh';
    return {ok:true,json:async()=>({audio:Buffer.from('ID3').toString('base64'),mime:'audio/mpeg',transcript:translated?(chinese?'中文摘要':'Türkçe özet'):posts.at(-1).text,
      translated,lang:translated?(chinese?'zh':'tr'):'en',language:translated?(chinese?'Chinese':'Turkish'):'English',note:null})};
  };
  return {posts,audios,globals:{fetch,Audio:FakeAudio,atob:s=>Buffer.from(s,'base64').toString('binary'),Blob:class{constructor(p,o){this.p=p;this.o=o}},
    URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},pinCountry:()=>'TR',exposureLabel:()=>'24 hours',chance:p=>`${(p*100).toFixed(1)}%`}};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
test('configured server: Read summary plays ElevenLabs audio in the local language, caches it, and stops on forecast changes',async()=>{
  const c=cloudGlobals(),h=harness({access:true,globals:c.globals});await tick();await tick();
  assert.equal(h.node('voiceLangBox').hidden,false);assert.ok(h.node('summaryLang').innerHTML.includes('Turkish'));assert.equal(h.node('summaryLang').value,'tr');
  await h.node('readSummary').onclick();
  assert.equal(c.posts.length,1);assert.equal(c.posts[0].lang,'tr');assert.equal(c.posts[0].text,h.run('lastSummary'));
  assert.equal(h.synth.calls.length,0,'device speech is not used');
  assert.equal(c.audios.length,1);assert.equal(c.audios[0].paused,false);assert.ok(h.node('spokenText').textContent.startsWith('Türkçe özet'));
  assert.ok(h.node('speechStatus').textContent.includes('Turkish'));
  h.ctx.cur.exposure.probability=.4321;h.run('updateSpokenSummary()');
  assert.equal(c.audios[0].paused,true);assert.ok(h.node('speechStatus').textContent.includes('forecast changed'));
  await h.node('readSummary').onclick();await h.node('readSummary').onclick();
  assert.equal(c.posts.length,2,'same summary and language is served from the page cache');
});
test('Chinese is available for every location and stays selected when the forecast changes',async()=>{
  const c=cloudGlobals(),h=harness({access:true,globals:c.globals});await tick();await tick();
  assert.match(h.node('summaryLang').innerHTML,/>Chinese \(中文\)</);
  h.node('summaryLang').value='zh';h.node('summaryLang').onchange();
  await h.node('readSummary').onclick();
  assert.equal(c.posts.at(-1).lang,'zh');assert.match(h.node('spokenText').textContent,/中文摘要/);
  h.ctx.pinCountry=()=>'US';h.ctx.loc.name='Another location';h.run('updateSpokenSummary()');
  assert.equal(h.node('summaryLang').value,'zh');
  assert.match(h.node('summaryLang').innerHTML,/>English</);
  h.ctx.pinCountry=()=>'CN';h.run('populateLanguages()');
  assert.equal((h.node('summaryLang').innerHTML.match(/value="zh"/g)||[]).length,1,'Local Chinese is not duplicated');
});

test('only languages advertised by the server can be selected',async()=>{
  const c=cloudGlobals(),h=harness({access:true,globals:c.globals});await tick();await tick();
  h.run('voiceCloud.languages=[{code:"en",name:"English"}]; voiceCloud.chosen="zh"; populateLanguages()');
  assert.equal(h.node('summaryLang').value,'en');assert.ok(!h.node('summaryLang').innerHTML.includes('value="zh"'));
});

test('a voice-service error falls back to the device voice with an explanation',async()=>{
  const c=cloudGlobals({fail:true}),h=harness({access:true,globals:c.globals});await tick();await tick();
  await h.node('readSummary').onclick();
  assert.equal(h.synth.calls.length,1);assert.ok(h.node('speechStatus').textContent.includes('credits'));assert.ok(h.node('speechStatus').textContent.includes('device voice'));
});
test('opened as a file, the page never calls the voice route and keeps device speech',async()=>{
  const c=cloudGlobals(),h=harness({access:true,href:'file:///x/index.html',globals:c.globals});await tick();
  assert.notEqual(h.node('voiceLangBox').hidden,false);h.node('readSummary').onclick();assert.equal(c.posts.length,0);assert.equal(h.synth.calls.length,1);
});
