const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const chat=require('../api/chat.js');

const ctx='Earthquake: M7.8 test';
const user=t=>({role:'user',parts:[{text:t}]});
function res(){const r={code:0,body:null,headers:{},status(c){r.code=c;return r},json(b){r.body=b;return r},setHeader(k,v){r.headers[k]=v}};return r}
let ipN=0;const req=(body,method='POST')=>({method,body,headers:{'x-forwarded-for':'10.0.0.'+(++ipN)},socket:{}});
function withFetch(impl,fn){const old=global.fetch;global.fetch=impl;return Promise.resolve(fn()).finally(()=>{global.fetch=old})}
function withKey(fn){const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-key';return Promise.resolve(fn()).finally(()=>{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old})}

test('validation accepts the app\'s turn shapes and rejects anything else',()=>{
  const call={role:'model',parts:[{functionCall:{name:'current_forecast',args:{}},thoughtSignature:'abc'}]};
  const result={role:'user',parts:[{functionResponse:{name:'current_forecast',response:{result:{chance_next_24_hours:'5%'}}}}]};
  assert.equal(chat.validate({contents:[user('hi')],context:ctx}),null);
  assert.equal(chat.validate({contents:[user('hi'),call,result],context:ctx}),null);
  assert.match(chat.validate({contents:[user('hi')]}),/context/);
  assert.match(chat.validate({contents:[],context:ctx}),/1 to 40/);
  assert.match(chat.validate({contents:[user('hi'),call],context:ctx}),/last message/);
  assert.match(chat.validate({contents:[{role:'model',parts:[{functionCall:{name:'run_shell'}}]},user('x')],context:ctx}),/Unknown tool/);
  assert.match(chat.validate({contents:[user('x'.repeat(1001))],context:ctx}),/too long/);
  assert.match(chat.validate({contents:[{role:'system',parts:[{text:'x'}]}],context:ctx}),/Malformed/);
});

test('every tool declared for Gemini is implemented in the browser',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','src','assistant.js'),'utf8');
  const impl=src.slice(src.indexOf('const ASK_TOOLS'),src.indexOf('function describeCall'));
  for(const t of chat.TOOLS)assert.match(impl,new RegExp(`\\b${t.name}:`),`${t.name} missing from src/assistant.js`);
});

test('the request carries the rules, the page context and the tools',()=>{
  const r=chat.request([user('hi')],ctx);
  assert.match(r.systemInstruction.parts[0].text,/Never say or imply that a building is safe to enter/);
  assert.match(r.systemInstruction.parts[0].text,/M7\.8 test/);
  assert.equal(r.tools[0].functionDeclarations.length,chat.TOOLS.length);
});

test('a new question must start with a tool call; after tool results Gemini may answer',()=>{
  assert.equal(chat.request([user('hi')],ctx).toolConfig.functionCallingConfig.mode,'ANY');
  const after=[user('hi'),{role:'model',parts:[{functionCall:{name:'current_forecast',args:{}}}]},{role:'user',parts:[{functionResponse:{name:'current_forecast',response:{result:{}}}}]}];
  assert.equal(chat.request(after,ctx).toolConfig.functionCallingConfig.mode,'AUTO');
});

test('handler refuses without a key, wrong methods and bad bodies',async()=>{
  const old=process.env.GEMINI_API_KEY;delete process.env.GEMINI_API_KEY;
  let r=res();await chat(req({contents:[user('hi')],context:ctx}),r);assert.equal(r.code,503);
  if(old!==undefined)process.env.GEMINI_API_KEY=old;
  await withKey(async()=>{
    r=res();await chat(req(null,'GET'),r);assert.equal(r.code,405);
    r=res();await chat(req({contents:'nope',context:ctx}),r);assert.equal(r.code,400);
  });
});

test('handler passes Gemini parts back unchanged and maps errors',async()=>{
  await withKey(()=>withFetch(async(url,opts)=>{
    assert.match(url,/:generateContent$/);assert.equal(opts.headers['x-goog-api-key'],'test-key');
    return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{functionCall:{name:'current_forecast',args:{}},thoughtSignature:'sig'}]}}]})};
  },async()=>{const r=res();await chat(req({contents:[user('hi')],context:ctx}),r);
    assert.equal(r.code,200);assert.deepEqual(r.body.parts,[{functionCall:{name:'current_forecast',args:{}},thoughtSignature:'sig'}])}));
  await withKey(()=>withFetch(async()=>({ok:false,status:429,json:async()=>({error:{message:'quota'}})}),
    async()=>{const r=res();const err=console.error;console.error=()=>{};await chat(req({contents:[user('hi')],context:ctx}),r);console.error=err;assert.equal(r.code,429);assert.match(r.body.error,/busy/)}));
});

test('rate limit trips after the allowed number of requests per visitor',()=>{
  const ip='test-ip-'+Date.now();let tripped=false;
  for(let i=0;i<41;i++)tripped=chat.limited(ip,1000+i);
  assert.equal(tripped,true);assert.equal(chat.limited('other-'+ip,1000),false);
});
