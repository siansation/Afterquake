# Fit the soil (Vs30) amplification term against USGS ShakeMap grids.
# Run from the repo root: python scripts/fit_site_term.py
import json,base64,math,numpy as np
D=json.load(open('data/sequences.json'))
def aww_rrup(M,R): return 3.950+0.913*M-1.107*np.log(np.sqrt(R**2+(1+0.813*np.exp(M-5))**2))
X=[];Y=[];G=[];stats=[]
for gi,s in enumerate(D['sequences']):
    sm=D['shakemaps'][s['key']]
    mmi=np.frombuffer(base64.b64decode(sm['mmi']),np.uint8).astype(float).reshape(sm['nr'],sm['nc'])/20
    vs=np.frombuffer(base64.b64decode(sm['vs30']),np.uint8).astype(float).reshape(sm['nr'],sm['nc'])*8
    lat=sm['lat0']-np.arange(sm['nr'])*sm['dlat']; lon=sm['lon0']+np.arange(sm['nc'])*sm['dlon']
    LO,LA=np.meshgrid(lon,lat)
    # rupture proxy: epicentre + M4.5+ aftershocks in first 2 days
    pts=[(s['lat'],s['lon'])]+[(e[2],e[3]) for e in s['events'] if 0<e[0]<2 and e[1]>=4.5]
    pts=np.array(pts)
    sub=(slice(None,None,3),slice(None,None,3))
    la,lo,mm,vv=LA[sub].ravel(),LO[sub].ravel(),mmi[sub].ravel(),vs[sub].ravel()
    c=math.cos(math.radians(s['lat']))
    d=np.min(np.hypot((la[:,None]-pts[None,:,0])*111,(lo[:,None]-pts[None,:,1])*111*c),axis=1)
    ok=(vv>80)&(mm>1)&(d<150)&(vv<2000)
    r=mm[ok]-aww_rrup(s['M'],d[ok])
    X.append(np.log10(vv[ok]/760));Y.append(r);G.append(np.full(ok.sum(),gi))
    stats.append((s['key'],int(ok.sum()),round(float(np.median(r)),2),round(float(np.median(vv[ok]))),round(float(np.corrcoef(np.log10(vv[ok]),r)[0,1]),2)))
X=np.concatenate(X);Y=np.concatenate(Y);G=np.concatenate(G)
# event fixed effects + common site slope
n=len(D['sequences']);A=np.zeros((len(X),n+1));A[np.arange(len(X)),G]=1;A[:,n]=X
coef,res,*_=np.linalg.lstsq(A,Y,rcond=None);k=coef[n]
pred=A@coef;sd=np.std(Y-pred)
for s in stats:print(s)
print('cells',len(X),'site slope k (dMMI per log10(Vs30/760))',round(k,3),'residual sd',round(sd,2),'event terms',np.round(coef[:n],2))
# bootstrap by event for uncertainty of k
ks=[]
rng=np.random.default_rng(1)
for b in range(200):
    pick=rng.integers(0,n,n);idx=np.concatenate([np.where(G==g)[0] for g in pick])
    Ab=np.zeros((len(idx),n+1));Ab[np.arange(len(idx)),G[idx]]=1;Ab[:,n]=X[idx]
    cb=np.linalg.lstsq(Ab,Y[idx],rcond=None)[0];ks.append(cb[n])
print('k 90% range',np.round(np.percentile(ks,[5,95]),2))
json.dump({'k':round(float(k),3),'k90':[round(float(x),2) for x in np.percentile(ks,[5,95])],'cells':int(len(X)),'sd':round(float(sd),2)},open('data/site-term-fit.json','w'))
