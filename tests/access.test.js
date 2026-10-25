const test=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('../test-support/access-harness.js');
const VIEW=require('../src/view-state.js');
function shared(){return {v:1,event:{kind:'case',id:'example'},a:{lat:0,lon:0,name:'Town A'},b:{lat:.1,lon:.2,name:'Town B'},
  minutes:10,building:'7',tolerance:.001,calibrated:true,at:'2023-02-06T12:34:56.789Z',dataAt:'recorded'}}

test('share copies one place and the exact selected time',async()=>{
  let copied;const h=harness({access:true,clipboard:{writeText:async value=>{copied=value}},href:'https://afterquake.test/?discard=secret'});
  await h.node('shareView').onclick();
  const state=VIEW.parse(new URL(copied).hash);
  assert.equal(state.a.name,'Town A');assert.equal(state.b,null);assert.equal(state.calibrated,false);assert.equal(state.at,h.ctx.cur.nowDate.toISOString());
  assert.equal(new URL(copied).search,'');assert.ok(h.node('shareStatus').textContent.includes('copied'));
});
test('clipboard denial gives manual copying, and standalone files explain the hosted requirement',async()=>{
  const h=harness({access:true,clipboard:{writeText:async()=>{throw new Error('denied')}}});await h.node('shareView').onclick();
  assert.equal(h.node('shareURL').selected,true);assert.ok(h.node('shareStatus').textContent.includes('Copy the selected link'));
  const file=harness({access:true,href:'file:///example/index.html'});await file.node('shareView').onclick();
  assert.ok(file.node('shareStatus').textContent.includes('hosted app'));
});
test('sharing validates the primary pin before applying any settings',()=>{
  const h=harness({access:true});
  assert.throws(()=>h.run('applyViewSetup('+JSON.stringify({...shared(),a:{lat:30,lon:30,name:'Outside'}})+')'),/outside the current map/);
  assert.equal(h.node('exposure').value,'1440');assert.equal(h.ctx.loc.name,'Town A');
});

test('older shared links retain their main place and time using the standard estimate',async()=>{
  const view=shared(),h=harness({access:true,hash:VIEW.fragment(view)});
  assert.equal(await h.run('openSharedView()'),true);
  assert.equal(h.ctx.cur.nowDate.toISOString(),view.at);assert.equal(h.ctx.replayTimeOverride,Date.parse(view.at));
  assert.equal(h.node('exposure').value,'10');assert.equal(h.node('bld').value,'7');assert.equal(h.ctx.cur.calib,false);
  assert.ok(h.node('sharedNotice').textContent.includes('older link now shows its main place'));
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

test('the story can demonstrate Read summary while ordinary playback still disables it',()=>{
  const h=harness({access:true});h.ctx.tourOn=true;h.run('updateSpokenSummary()');
  assert.equal(h.node('readSummary').disabled,false);h.node('readSummary').onclick();assert.equal(h.synth.calls.length,1);
  h.ctx.playing=true;h.run('updateSpokenSummary()');assert.equal(h.node('readSummary').disabled,true);
});

// ElevenLabs path: only when the hosted /api/speak route says it is configured.
function cloudGlobals({fail=false,translated=true}={}){
  const posts=[],audios=[];
  class FakeAudio{constructor(src){this.src=src;this.paused=true;audios.push(this)}play(){this.paused=false;return Promise.resolve()}pause(){this.paused=true}}
  const fetch=async(url,init={})=>{
    if(!init.method)return {ok:true,json:async()=>({configured:true,languages:[{code:'en',name:'English'},{code:'tr',name:'Turkish'},{code:'zh',name:'Chinese'},{code:'es',name:'Spanish'}]})};
    posts.push(JSON.parse(init.body));
    if(fail)return {ok:false,json:async()=>({error:'Voice credits have run out on this server.'})};
    const lang=translated?posts.at(-1).lang:'en',names={en:'English',zh:'Chinese',tr:'Turkish',es:'Spanish'};
    const transcripts={zh:'中文摘要',tr:'Türkçe özet',es:'Resumen en español'};
    return {ok:true,json:async()=>({audio:Buffer.from('ID3').toString('base64'),mime:'audio/mpeg',transcript:transcripts[lang]||posts.at(-1).text,
      translated:lang!=='en',lang,language:names[lang],note:null})};
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

test('all four story languages stay available outside their countries and use the selected voice language',async()=>{
  const c=cloudGlobals(),h=harness({access:true,globals:c.globals});await tick();await tick();
  h.ctx.pinCountry=()=>'US';h.run('populateLanguages()');
  const codes=[...h.node('summaryLang').innerHTML.matchAll(/value="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(codes,['en','zh','tr','es']);
  for(const lang of codes){
    h.node('summaryLang').value=lang;h.node('summaryLang').onchange();
    await h.node('readSummary').onclick();assert.equal(c.posts.at(-1).lang,lang);
    h.ctx.loc.name='Next scene '+lang;h.run('updateSpokenSummary()');
    assert.equal(h.node('summaryLang').value,lang,'A new story estimate must preserve the language');
    assert.equal(c.audios.at(-1).paused,true,'Changing the forecast must stop the old language clip');
  }
  h.ctx.pinCountry=()=>'ES';h.run('populateLanguages()');
  assert.equal((h.node('summaryLang').innerHTML.match(/value="es"/g)||[]).length,1);
  assert.equal(h.synth.calls.length,0);
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
