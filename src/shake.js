// Shaking at a point. Intensity (MMI) from an aftershock of magnitude M at hypocentral distance R km:
// Allen, Wald & Worden (2012), hypocentral-distance form (coefficients as implemented in OpenQuake):
//   MMI = 2.085 + 1.428 M - 1.402 ln( sqrt(R^2 + (-0.209 + 2.042 e^(M-5))^2) ) + 0.078 ln(R/50) [R > 50]
//   sigma = 0.82 + 0.37 / (1 + (R/22.9)^2)
// Soil term fitted by us to USGS ShakeMap grids: dMMI = K * log10(Vs30/760).
// Optional "ShakeMap calibration": USGS ShakeMaps of 26 aftershocks averaged BIAS below the equation.
const SHAKE=(()=>{
  const K=-1.771, BIAS=-0.90, H=10, KERNEL=6, MMAX=8.5;
  function mu(M,R){return 2.085+1.428*M-1.402*Math.log(Math.sqrt(R*R+(-0.209+2.042*Math.exp(M-5))**2))+(R>50?0.078*Math.log(R/50):0)}
  function sig(R){return 0.82+0.37/(1+(R/22.9)**2)}
  function site(vs){return vs>0?K*Math.log10(vs/760):0}
  function Phi(z){const t=1/(1+0.2316419*Math.abs(z)),d=0.3989423*Math.exp(-z*z/2),p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p}
  // table: chance that one M>=5 aftershock (magnitude drawn from Gutenberg-Richter, b=1) at distance R exceeds effective threshold
  const T0=2,T1=12,TS=0.05,RS=0.5,RMAX=400,NT=Math.round((T1-T0)/TS)+1,NR=RMAX/RS+1;
  const mags=[],wts=[];for(let m=5.0;m<MMAX;m+=0.1){mags.push(m+0.05);wts.push(Math.pow(10,-(m-5))-Math.pow(10,-(m+0.1-5)))}
  const tab=new Float32Array(NT*NR);
  for(let i=0;i<NT;i++){const thr=T0+i*TS;for(let j=0;j<NR;j++){const d=j*RS,R=Math.sqrt(d*d+H*H+KERNEL*KERNEL);let s=0;for(let k=0;k<mags.length;k++)s+=wts[k]*(1-Phi((thr-mu(mags[k],R))/sig(R)));tab[i*NR+j]=s}}
  function g(thrEff,d){let i=Math.round((thrEff-T0)/TS);if(i<0)i=0;if(i>=NT)return 0;let j=Math.round(d/RS);if(j>=NR)return 0;return tab[i*NR+j]}
  // q = chance that a random future M>=5 aftershock produces shaking >= thr at (x,y), averaged over where aftershocks are expected
  function q(src,x,y,vs,thr,calib){const te=thr-site(vs)-(calib?BIAS:0);let s=0;for(let k=0;k<src.length;k+=2){const dx=src[k]-x,dy=src[k+1]-y;s+=g(te,Math.sqrt(dx*dx+dy*dy))}return s/(src.length/2)}
  // collapse the forecast posterior to (weight, a, p) list carrying most of the mass
  function compact(f){const l=f.post.filter(p=>p[2]>1e-5).sort((a,b)=>b[2]-a[2]);let z=0;for(const p of l)z+=p[2];return l.map(p=>[p[2]/z,p[0],p[1]])}
  function n5(f,a,p,t1,t2){const s=f.now-f.tm,c=0.018,I=(Math.abs(p-1)<1e-6)?Math.log((s+t2+c)/(s+t1+c)):(Math.pow(s+t2+c,1-p)-Math.pow(s+t1+c,1-p))/(1-p);return Math.pow(10,a+(f.Mm-5))*I}
  function probQ(f,cp,qv,t1,t2){if(qv<=0)return 0;let P=0;for(const [w,a,p] of cp)P+=w*(1-Math.exp(-n5(f,a,p,t1,t2)*qv));return P}
  function reentryQ(f,cp,qv,tol){if(probQ(f,cp,qv,0,1)<tol)return 0;let lo=0,hi=400;if(probQ(f,cp,qv,hi,hi+1)>=tol)return Infinity;for(let i=0;i<40;i++){const m=(lo+hi)/2;if(probQ(f,cp,qv,m,m+1)<tol)hi=m;else lo=m}return hi}
  return {mu,sig,site,q,compact,probQ,reentryQ,n5,K,BIAS,H,KERNEL};
})();
if(typeof module!=='undefined')module.exports=SHAKE;
