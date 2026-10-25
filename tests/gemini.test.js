const test=require('node:test'),assert=require('node:assert/strict');
const GEMINI=require('../server/gemini');
const response=(status,code='UNAVAILABLE')=>({ok:status===200,status,json:async()=>status===200?{candidates:[{content:{parts:[{text:'Ready'}]}}]}:{error:{status:code}}});
async function mocked(fetch,run){const old=global.fetch;global.fetch=fetch;try{await run()}finally{global.fetch=old}}
const input={key:'private-key',build:()=>({contents:[],generationConfig:{temperature:0}}),wait:async()=>{}};

test('overloaded primary fails over with bounded attempts and model-appropriate settings',async()=>{
  const calls=[];await mocked(async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return response(calls.length===1?503:200)},async()=>{
    const result=await GEMINI.generate(input);assert.equal(result.model,GEMINI.models()[1]);assert.equal(calls.length,2);
    assert.match(calls[0].url,/gemini-3\.5-flash-lite/);assert.equal(calls[0].body.generationConfig.thinkingConfig.thinkingLevel,'minimal');
    assert.ok(!JSON.stringify(calls).includes('private-key'));
  });
});
test('signed tool continuations retry on the same model instead of switching signatures',async()=>{
  const urls=[];await mocked(async url=>{urls.push(url);return response(urls.length===1?503:200)},async()=>{
    const model=GEMINI.models()[1],result=await GEMINI.generate({...input,model});
    assert.equal(result.model,model);assert.equal(urls[0],urls[1]);
  });
});
test('invalid credentials and quota failures are not retried or hidden by model failover',async()=>{
  for(const status of [400,401,403,429]){let calls=0;await mocked(async()=>{calls++;return response(status)},async()=>{
    await assert.rejects(GEMINI.generate(input),e=>e.status===status);assert.equal(calls,1);
  })}
});
test('a stalled model is aborted and a backup can complete',async()=>{
  let calls=0;await mocked(async(_url,{signal})=>{
    if(++calls===1)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    return response(200);
  },async()=>{const result=await GEMINI.generate({...input,timeoutMs:5});assert.equal(calls,2);assert.equal(result.model,GEMINI.models()[1])});
});
test('all-model outages stop after two attempts and return a clear temporary error',async()=>{
  let calls=0;await mocked(async()=>{calls++;return response(503)},async()=>{
    await assert.rejects(GEMINI.generate(input),e=>GEMINI.publicError(e)[0]===503);assert.equal(calls,2);
  });
});
