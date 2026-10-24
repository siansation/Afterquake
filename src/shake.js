// Shaking at a point. Intensity (MMI) from an aftershock of magnitude M at hypocentral distance R km:
// Allen, Wald & Worden (2012), hypocentral-distance form (coefficients as implemented in OpenQuake):
//   MMI = 2.085 + 1.428 M - 1.402 ln( sqrt(R^2 + (-0.209 + 2.042 e^(M-5))^2) ) + 0.078 ln(R/50) [R > 50]
//   sigma = 0.82 + 0.37 / (1 + (R/22.9)^2)
// Soil term fitted by us to USGS ShakeMap grids: dMMI = K * log10(Vs30/760). K comes from data/site-term-fit.json
// (npm run fit); build.py swaps the require for the number so the browser build needs no file access.
// Optional in-sample offset: the event-average gap from 26 aftershock ShakeMaps.
// This comparison reuses fitted data and does not independently validate the model.
const SHAKE=(()=>{
  const K=require('../data/site-term-fit.json').k, BIAS=-0.90, H=10, KERNEL=6, MMAX=8.5;
  function mu(M,R){return 2.085+1.428*M-1.402*Math.log(Math.sqrt(R*R+(-0.209+2.042*Math.exp(M-5))**2))+(R>50?0.078*Math.log(R/50):0)}
  function sig(R){return 0.82+0.37/(1+(R/22.9)**2)}
  function site(vs){return vs>0?K*Math.log10(vs/760):0}
  function Phi(z){const t=1/(1+0.2316419*Math.abs(z)),d=0.3989423*Math.exp(-z*z/2),p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p}
  // table: chance that one M>=5 aftershock (magnitude drawn from Gutenberg-Richter, b=1) at distance R exceeds effective threshold
  const T0=2,T1=12,TS=0.05,RS=0.5,RMAX=400,NT=Math.round((T1-T0)/TS)+1,NR=RMAX/RS+1;
  // Integer indices keep floating-point addition from accidentally including a bin above MMAX.
  const mags=[],wts=[];for(let k=0;k<Math.round((MMAX-5)*10);k++){const m=5+k/10;mags.push(m+0.05);wts.push(Math.pow(10,-(m-5))-Math.pow(10,-(m+0.1-5)))}
  // Normalise the explicitly truncated M5 <= M < 8.5 distribution.
  const magMass=wts.reduce((a,b)=>a+b,0);for(let k=0;k<wts.length;k++)wts[k]/=magMass;
  const m6Rate=wts.reduce((s,w,k)=>s+(mags[k]>=6?w:0),0);
  // tab6 is the JOINT probability of damage and M6+, not damage conditional on M6+.
  // Keeping that intersection lets the simulation colour M6+ events without double counting damage.
  const tab=new Float32Array(NT*NR),tab6=new Float32Array(NT*NR);
  for(let i=0;i<NT;i++){const thr=T0+i*TS;for(let j=0;j<NR;j++){const d=j*RS,R=Math.sqrt(d*d+H*H+KERNEL*KERNEL);let s=0,s6=0;for(let k=0;k<mags.length;k++){const v=wts[k]*(1-Phi((thr-mu(mags[k],R))/sig(R)));s+=v;if(mags[k]>=6)s6+=v}tab[i*NR+j]=s;tab6[i*NR+j]=s6}}
  function g(thrEff,d,table=tab){let i=Math.round((thrEff-T0)/TS);if(i<0)i=0;if(i>=NT)return 0;let j=Math.round(d/RS);if(j>=NR)return 0;return table[i*NR+j]}
  // q = chance that a random future M>=5 aftershock produces shaking >= thr at (x,y), averaged over where aftershocks are expected
  function marks(src,x,y,vs,thr,calib){if(!src.length||src.length%2)throw new RangeError('At least one source coordinate pair is required.');const te=thr-site(vs)-(calib?BIAS:0);let damage=0,damageM6=0;for(let k=0;k<src.length;k+=2){const d=Math.hypot(src[k]-x,src[k+1]-y);damage+=g(te,d);damageM6+=g(te,d,tab6)}return{damage:damage/(src.length/2),damageM6:damageM6/(src.length/2),m6:m6Rate}}
  function q(src,x,y,vs,thr,calib){return marks(src,x,y,vs,thr,calib).damage}
  // Keep EVERY posterior weight. A fixed-length slice loses uncertainty mass and understates risk.
  function compact(f){return f.post.map(([a,p,w])=>[w,a,p])}
  function n5(f,a,p,t1,t2){const s=f.now-f.tm,c=0.018;if(t2<=t1)return 0;const lr=Math.log1p((t2-t1)/(s+t1+c)),I=Math.abs(p-1)<1e-10?lr:Math.pow(s+t1+c,1-p)*Math.expm1((1-p)*lr)/(1-p);return Math.pow(10,a+(f.Mm-5))*I}
  // Reuse interval rates when shading thousands of map cells with one forecast.
  // Both the posterior array and forecast identity matter: the same parameters at a
  // later replay time have different rates. Bound the cache as the curve samples intervals.
  const rateCache=new WeakMap();
  function intervalRates(f,cp,t1,t2){let entry=rateCache.get(cp);if(!entry||entry.forecast!==f){entry={forecast:f,intervals:new Map()};rateCache.set(cp,entry)}const cache=entry.intervals,key=t1+'|'+t2;let rates=cache.get(key);if(!rates){rates=cp.map(([,a,p])=>n5(f,a,p,t1,t2));if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,rates)}return rates}
  function probQ(f,cp,qv,t1,t2){if(qv<=0)return 0;const rates=intervalRates(f,cp,t1,t2);let P=0;for(let i=0;i<cp.length;i++)P+=cp[i][0]*-Math.expm1(-rates[i]*qv);return P}
  // Quantiles are weighted by posterior mass, not by the number of grid cells.
  // They describe parameter uncertainty only, rather than all uncertainty in local shaking.
  function parameterRange(f,cp,qv,t1,t2){const pairs=cp.map(([w,a,p])=>[-Math.expm1(-n5(f,a,p,t1,t2)*qv),w]).sort((a,b)=>a[0]-b[0]);const quantile=target=>{let w=0;for(const [v,weight] of pairs){w+=weight;if(w>=target)return v}return pairs[pairs.length-1][0]};return{low:quantile(.05),high:quantile(.95)}}
  // Search over candidate START times, integrating over the full planned exposure
  // after each start. A short visit is a different window, not 24-hour odds scaled down.
  function reentryQ(f,cp,qv,tol,duration=1){
    if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(tol)||tol<=0||tol>=1)throw new RangeError('Invalid exposure duration or risk limit.');
    if(probQ(f,cp,qv,0,duration)<tol)return 0;let lo=0,hi=400;
    if(probQ(f,cp,qv,hi,hi+duration)>=tol)return Infinity;
    for(let i=0;i<40;i++){const m=(lo+hi)/2;if(probQ(f,cp,qv,m,m+duration)<tol)hi=m;else lo=m}return hi}
  // Marked Poisson process from the SAME RJ model as probQ. Counts for disjoint
  // marks are independent conditional on a,p; sampling whether each is nonzero
  // is exact for the daily colour chart and needs no count approximation.
  // RJ is not ETAS: adding a second branching process would change the model.
  function simulateFutures(f,cp,mark,days=30,n=200,rng=Math.random){
    if(!Number.isInteger(days)||days<1||!Number.isInteger(n)||n<1)throw new RangeError('Positive integer days and simulations are required.');
    const mass=cp.reduce((s,c)=>s+c[0],0);if(Math.abs(mass-1)>1e-10)throw new RangeError('Posterior weights must sum to one.');
    const cdf=[];let acc=0;for(const c of cp){acc+=c[0];cdf.push(acc)}
    const rows=[];let hits=0;
    // Draw a,p once per future, preserving uncertainty shared across all its days.
    // Red uses all damaging events; grey uses the disjoint M6+ AND non-damaging category.
    // A Poisson process has P(at least one event)=1-exp(-rate), so daily flags are exact
    // for this model without approximating Poisson counts or enumerating every event.
    for(let i=0;i<n;i++){const u=rng();let lo=0,hi=cp.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(cdf[mid]<u)lo=mid+1;else hi=mid}const [,a,p]=cp[lo],row=[];
      for(let d=0;d<days;d++){const rate=n5(f,a,p,d,d+1),damage=rng()<-Math.expm1(-rate*mark.damage),large=rng()<-Math.expm1(-rate*Math.max(0,mark.m6-mark.damageM6));row.push(damage?2:large?1:0)}
      if(row.includes(2))hits++;rows.push(row)}
    return{rows,hits,n};
  }
  return {mu,sig,site,q,marks,compact,probQ,parameterRange,reentryQ,n5,simulateFutures,K,BIAS,H,KERNEL,MMAX};
})();
if(typeof module!=='undefined')module.exports=SHAKE;
