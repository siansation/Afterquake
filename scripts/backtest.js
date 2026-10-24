// Backtest: forecast the next 7 days at fixed times after each mainshock, using only earlier data, and score it.
// Run from the repo root: node scripts/backtest.js
const M=require('../src/model.js');const D=require('../data/sequences.json');
// Sanity: generic prior for a M7 quake, 1 day in: USGS-style P(M>=5 next 7 days)
console.log('fit check');
for(const s of D.sequences){const f=M.fit(s.events,1);console.log(s.key.padEnd(12),'M'+s.M,'n='+String(f.n).padStart(3),'a='+f.aMean.toFixed(2),'p='+f.pMean.toFixed(2),
 'P(M5+ 7d)='+(M.prob(f,5,0,7)*100).toFixed(0)+'%','P(M6+ 7d)='+(M.prob(f,6,0,7)*100).toFixed(0)+'%','P(M7+ 7d)='+(M.prob(f,7,0,7)*100).toFixed(1)+'%')}
// Backtest: at each check time, forecast P(M>=6 in next 7d) and P(M>=5 in next 7d), compare with outcome
const checks=[0.5,1,2,3,7,14,30,60];let rows=[];
for(const s of D.sequences)for(const t of checks){if(t+7>s.daysAvailable)continue;const f=M.fit(s.events,t);
 for(const mag of [5,6]){const p=M.prob(f,mag,0,7);const hap=s.events.some(e=>e[0]>t&&e[0]<=t+7&&e[1]>=mag);rows.push({s:s.key,t,mag,p,hap})}}
for(const mag of [5,6]){const r=rows.filter(x=>x.mag===mag);const brier=r.reduce((a,x)=>a+(x.p-(x.hap?1:0))**2,0)/r.length;
 const base=r.filter(x=>x.hap).length/r.length;const bb=r.reduce((a,x)=>a+(base-(x.hap?1:0))**2,0)/r.length;
 console.log(`\nM${mag}+ next 7 days: ${r.length} forecasts, happened ${r.filter(x=>x.hap).length} times`);
 console.log(` mean forecast ${(r.reduce((a,x)=>a+x.p,0)/r.length*100).toFixed(1)}%  observed rate ${(base*100).toFixed(1)}%  Brier ${brier.toFixed(3)} vs constant-rate baseline ${bb.toFixed(3)}  skill ${(1-brier/bb).toFixed(2)}`);
 const bins=[[0,.1],[.1,.3],[.3,.6],[.6,1.01]];for(const [lo,hi] of bins){const b=r.filter(x=>x.p>=lo&&x.p<hi);if(b.length)console.log(`  forecast ${lo*100}-${Math.min(100,hi*100)}%: n=${b.length}, mean forecast ${(b.reduce((a,x)=>a+x.p,0)/b.length*100).toFixed(0)}%, happened ${(b.filter(x=>x.hap).length/b.length*100).toFixed(0)}%`)}}
// Key stories
const story=(k,t,mag)=>{const s=D.sequences.find(x=>x.key===k),f=M.fit(s.events,t);console.log(k,'day',t,'P(M'+mag+'+ next 24h)',(M.prob(f,mag,0,1)*100).toFixed(1)+'%','next 30d',(M.prob(f,mag,0,30)*100).toFixed(1)+'%','reentry@1%',M.reentry(f,mag,0.01).toFixed(1)+'d')};
console.log();story('turkey',0.3,7);story('nepal',10,6.5);story('darfield',30,6);story('darfield',150,6);story('nagqu26',2.03,6);
const t0=Date.now();const f=M.fit(D.sequences[0].events,3);M.simulate(f,6,0,7);M.reentry(f,6,0.01);console.log('ms',Date.now()-t0);
