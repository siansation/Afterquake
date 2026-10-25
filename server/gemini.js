// Shared, bounded recovery for chat and translation. Never retry invalid keys,
// permissions or quota failures; those need an account/configuration change.
const DEFAULT_MODEL='gemini-3.5-flash-lite',DEFAULT_FALLBACK='gemini-3.1-flash-lite';
function models(){return [...new Set([process.env.GEMINI_MODEL?.trim()||DEFAULT_MODEL,
  process.env.GEMINI_FALLBACK_MODEL===undefined?DEFAULT_FALLBACK:process.env.GEMINI_FALLBACK_MODEL.trim()].filter(Boolean))]}
function thinking(model){
  if(/^gemini-[34]/.test(model))return {thinkingLevel:process.env.GEMINI_THINKING||(/flash-lite/.test(model)?'minimal':'low')};
  if(/^gemini-2\.5-flash/.test(model))return {thinkingBudget:0};
  return undefined;
}
class GeminiError extends Error{
  constructor(status,code){super('Gemini request failed');this.status=status;this.code=code}
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function generate({key,build,signal,model:affinity,timeoutMs=10000,wait=pause}){
  const available=models(),attempts=affinity?[affinity,affinity]:available.slice(0,2);
  if(attempts.length===1)attempts.push(attempts[0]);
  let failure;
  for(let i=0;i<attempts.length;i++){
    if(signal?.aborted)throw signal.reason;
    const model=attempts[i],controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    const requestSignal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    try{
      const body=build(model);body.generationConfig={...body.generationConfig,thinkingConfig:thinking(model)};
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
        method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal:requestSignal});
      const data=await r.json().catch(()=>{throw new GeminiError(r.status>=400?r.status:502,'INVALID_RESPONSE')});
      if(!r.ok)throw new GeminiError(r.status,data.error?.status||'UPSTREAM_ERROR');
      return {data,model};
    }catch(error){
      if(signal?.aborted)throw signal.reason;
      failure=error instanceof GeminiError?error:new GeminiError(503,controller.signal.aborted?'TIMEOUT':'NETWORK_ERROR');
      // Log useful diagnostics without credentials, prompts or private forecasts.
      console.warn('Gemini request unavailable',JSON.stringify({model,status:failure.status,code:failure.code,attempt:i+1}));
      const transient=failure.status===408||failure.status>=500;
      const unavailable=failure.status===404&&!affinity;
      if(!transient&&!unavailable)throw failure;
    }finally{clearTimeout(timer)}
    if(i+1<attempts.length)await wait(200+Math.floor(Math.random()*200));
  }
  throw failure;
}
function publicError(error){
  if(error.status===429)return [429,'The assistant is busy right now. Try again in a minute.'];
  if(error.status===401||error.status===403)return [503,'The assistant is not set up correctly on this server.'];
  if(error.status===404)return [503,'The assistant model is unavailable right now. Try again shortly.'];
  if(error.status>=500||error.status===408)return [503,'Gemini is temporarily busy. Please try again shortly.'];
  return [502,'The assistant could not process that question. Try asking it another way.'];
}
module.exports={models,thinking,generate,publicError,GeminiError};
