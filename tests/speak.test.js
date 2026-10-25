const test=require('node:test');
const assert=require('node:assert/strict');
const speak=require('../api/speak.js');

function res(){const r={code:0,body:null,headers:{},status(c){r.code=c;return r},json(b){r.body=b;return r},setHeader(k,v){r.headers[k]=v}};return r}
let ipN=0;const req=(body,method='POST',ip)=>({method,body,headers:{'x-forwarded-for':ip||'10.1.0.'+(++ipN)},socket:{}});
function withFetch(impl,fn){const old=global.fetch;global.fetch=impl;return Promise.resolve(fn()).finally(()=>{global.fetch=old})}
function withEnv(vars,fn){const old={};for(const k of Object.keys(vars)){old[k]=process.env[k];if(vars[k]==null)delete process.env[k];else process.env[k]=vars[k]}
  return Promise.resolve(fn()).finally(()=>{for(const k of Object.keys(old)){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}})}
const audioResponse=(bytes=[73,68,51])=>({ok:true,status:200,arrayBuffer:async()=>new Uint8Array(bytes).buffer,text:async()=>''});
const gemini=text=>({ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text}]}}]})});
const EN='For a stay of 24 hours, the estimated chance is 9.2 percent, range 2.4 to 19.9 percent, from Mon 6 Feb, 08:29 UTC.';

test('validation accepts summaries in supported languages and rejects anything else',()=>{
  assert.equal(speak.validate({text:'Hello',lang:'tr'}),null);
  assert.equal(speak.validate({text:'Hello'}),null);
  assert.match(speak.validate(null),/JSON/);
  assert.match(speak.validate({text:''}),/Missing/);
  assert.match(speak.validate({text:'x'.repeat(1501)}),/too long/);
  assert.match(speak.validate({text:'Hi',lang:'xx'}),/Unsupported/);
  assert.match(speak.validate({text:'Hi',lang:'__proto__'}),/Unsupported/);
});

test('GET reports configuration without secrets; local languages need the translation key',async()=>{
  await withEnv({ELEVENLABS_API_KEY:'el-secret',GEMINI_API_KEY:null},async()=>{
    const r=res();await speak(req(null,'GET'),r);
    assert.equal(r.code,200);assert.equal(r.body.configured,true);assert.deepEqual(r.body.languages.map(l=>l.code),['en']);
    assert.ok(!JSON.stringify(r.body).includes('el-secret'));
  });
  await withEnv({ELEVENLABS_API_KEY:'el-secret',GEMINI_API_KEY:'g'},async()=>{
    const r=res();await speak(req(null,'GET'),r);const codes=r.body.languages.map(l=>l.code);
    for(const c of ['en','zh','tr','ja','es','id','hi'])assert.ok(codes.includes(c),c);
  });
  await withEnv({ELEVENLABS_API_KEY:null},async()=>{const r=res();await speak(req(null,'GET'),r);assert.equal(r.body.configured,false);assert.deepEqual(r.body.languages,[])});
});

test('unconfigured server answers 503 and other methods 405',async()=>{
  await withEnv({ELEVENLABS_API_KEY:null},async()=>{const r=res();await speak(req({text:'Hi'}),r);assert.equal(r.code,503)});
  const r=res();await speak(req(null,'PUT'),r);assert.equal(r.code,405);assert.equal(r.headers.Allow,'GET, POST');
});

test('English: one ElevenLabs call with the default voice and model; the key travels only in the header',async()=>{
  const calls=[];
  await withEnv({ELEVENLABS_API_KEY:'el-secret',GEMINI_API_KEY:'g'},()=>withFetch(async(url,init)=>{calls.push({url,init});return audioResponse()},async()=>{
    const r=res();await speak(req({text:EN,lang:'en'}),r);
    assert.equal(r.code,200);assert.equal(calls.length,1,'no translation for English');
    const {url,init}=calls[0],body=JSON.parse(init.body);
    assert.match(url,new RegExp(`/v1/text-to-speech/${speak.defaults.voice}\\?output_format=mp3_44100_64$`));
    assert.equal(init.headers['xi-api-key'],'el-secret');assert.ok(!url.includes('el-secret'));assert.ok(!init.body.includes('el-secret'));
    assert.equal(body.model_id,'eleven_flash_v2_5');assert.equal(body.language_code,'en');assert.equal(body.text,EN);
    assert.equal(r.body.audio,Buffer.from([73,68,51]).toString('base64'));assert.equal(r.body.translated,false);assert.equal(r.body.lang,'en');
    assert.ok(!JSON.stringify(r.body).includes('el-secret'));
  }));
});

test('local language: Gemini translates first, then ElevenLabs speaks the translation with the language enforced',async()=>{
  const calls=[],tr='24 saatlik bir kalış için tahmini olasılık yüzde 9,2, aralık yüzde 2,4 ile 19,9 arası, 6 Şubat Pazartesi 08:29 UTC itibarıyla.';
  await withEnv({ELEVENLABS_API_KEY:'el',GEMINI_API_KEY:'g-key'},()=>withFetch(async(url,init)=>{calls.push({url,init});return /generativelanguage/.test(url)?gemini(tr):audioResponse()},async()=>{
    const r=res();await speak(req({text:EN,lang:'tr'}),r);
    assert.equal(r.code,200);assert.equal(calls.length,2);
    assert.equal(calls[0].init.headers['x-goog-api-key'],'g-key');
    const g=JSON.parse(calls[0].init.body);assert.match(g.systemInstruction.parts[0].text,/Turkish/);assert.match(g.systemInstruction.parts[0].text,/Keep every number/);
    assert.match(g.systemInstruction.parts[0].text,/short, everyday sentences/);
    assert.match(g.systemInstruction.parts[0].text,/Preserve safety conditions exactly/);
    assert.equal(g.contents[0].parts[0].text,EN);
    const el=JSON.parse(calls[1].init.body);assert.equal(el.text,tr);assert.equal(el.language_code,'tr');
    assert.equal(r.body.translated,true);assert.equal(r.body.transcript,tr);assert.equal(r.body.language,'Turkish');
  }));
});

test('Chinese speech keeps the supplied figures and enforces Chinese in ElevenLabs',async()=>{
  const calls=[],zh='停留24小时，预计概率为百分之9.2，范围为百分之2.4至19.9，时间为周一2月6日08:29 UTC。';
  await withEnv({ELEVENLABS_API_KEY:'el',GEMINI_API_KEY:'g'},()=>withFetch(async(url,init)=>{
    calls.push({url,init});return /generativelanguage/.test(url)?gemini(zh):audioResponse();
  },async()=>{
    const r=res();await speak(req({text:EN,lang:'zh'}),r);
    assert.equal(r.code,200);assert.equal(r.body.lang,'zh');assert.equal(r.body.translated,true);
    assert.equal(r.body.transcript,zh);assert.equal(speak.numbersPreserved(EN,zh),true);
    assert.match(JSON.parse(calls[0].init.body).systemInstruction.parts[0].text,/Chinese/);
    assert.equal(JSON.parse(calls[1].init.body).language_code,'zh');
    assert.equal(JSON.parse(calls[1].init.body).text,zh);
  }));
});

test('a translation that drops or changes a figure is rejected and English is read instead',async()=>{
  assert.equal(speak.numbersPreserved('9.2 percent at 08:29','yüzde 9,2 saat 08:29'),true);
  assert.equal(speak.numbersPreserved('9.2 percent at 08:29','yüzde 9,3 saat 08:29'),false);
  assert.equal(speak.numbersPreserved('2 and 2','iki ve 2'),false,'each occurrence must survive');
  const calls=[];
  await withEnv({ELEVENLABS_API_KEY:'el',GEMINI_API_KEY:'g'},()=>withFetch(async(url,init)=>{calls.push({url,init});return /generativelanguage/.test(url)?gemini('yüzde 9 olasılık'):audioResponse()},async()=>{
    const r=res();await speak(req({text:EN,lang:'tr'}),r);
    assert.equal(r.code,200);assert.equal(r.body.translated,false);assert.equal(r.body.lang,'en');assert.match(r.body.note,/changed a figure/);
    assert.equal(JSON.parse(calls[1].init.body).text,EN);
  }));
});

test('without a translation key or when Gemini fails, local-language requests fall back to English with a note',async()=>{
  await withEnv({ELEVENLABS_API_KEY:'el',GEMINI_API_KEY:null},()=>withFetch(async()=>audioResponse(),async()=>{
    const r=res();await speak(req({text:EN,lang:'ja'}),r);assert.equal(r.code,200);assert.equal(r.body.lang,'en');assert.match(r.body.note,/not set up/);
  }));
  await withEnv({ELEVENLABS_API_KEY:'el',GEMINI_API_KEY:'g'},()=>withFetch(async url=>/generativelanguage/.test(url)?{ok:false,status:500,json:async()=>({})}:audioResponse(),async()=>{
    const r=res();await speak(req({text:EN,lang:'ja'}),r);assert.equal(r.code,200);assert.equal(r.body.lang,'en');assert.match(r.body.note,/Could not translate/);
  }));
});

test('upstream errors map to friendly messages without leaking details',async()=>{
  const cases=[[401,'{"detail":{"status":"invalid_api_key"}}',503,/not set up correctly/],[401,'{"detail":{"status":"quota_exceeded"}}',503,/credits/],
    [429,'upstream-429-detail',429,/busy/],[500,'internal',502,/Could not create/]];
  for(const [status,detail,code,msg] of cases){
    await withEnv({ELEVENLABS_API_KEY:'el'},()=>withFetch(async()=>({ok:false,status,text:async()=>detail,arrayBuffer:async()=>new ArrayBuffer(0)}),async()=>{
      const r=res();await speak(req({text:'Hello'}),r);assert.equal(r.code,code);assert.match(r.body.error,msg);assert.ok(!JSON.stringify(r.body).includes(detail));
    }));
  }
  await withEnv({ELEVENLABS_API_KEY:'el'},()=>withFetch(async()=>{throw new Error('network down')},async()=>{const r=res();await speak(req({text:'Hello'}),r);assert.equal(r.code,502)}));
  await withEnv({ELEVENLABS_API_KEY:'el'},()=>withFetch(async()=>{const e=new Error('aborted');e.name='AbortError';throw e},async()=>{const r=res();await speak(req({text:'Hello'}),r);assert.equal(r.code,504)}));
});

test('bad bodies are rejected before any upstream call; strings are parsed',async()=>{
  let called=0;
  await withEnv({ELEVENLABS_API_KEY:'el'},()=>withFetch(async()=>{called++;return audioResponse()},async()=>{
    let r=res();await speak(req({text:'x'.repeat(2000)}),r);assert.equal(r.code,400);
    r=res();await speak(req('not json'),r);assert.equal(r.code,400);
    r=res();await speak(req('x'.repeat(5000)),r);assert.equal(r.code,413);
    r=res();await speak(req(JSON.stringify({text:'Hello'})),r);assert.equal(r.code,200);
  }));
  assert.equal(called,1);
});

test('rate limit: about 20 summaries per visitor per 10 minutes',()=>{
  const t=Date.now();let blocked=false;for(let i=0;i<20;i++)blocked=speak.limited('rl-test',t+i);assert.equal(blocked,false);
  assert.equal(speak.limited('rl-test',t+21),true);assert.equal(speak.limited('rl-test',t+11*60e3),false);
});

test('older models are not sent a language code they reject',()=>{
  assert.equal(speak.speechRequest('Hi','tr').language_code,'tr');
});
