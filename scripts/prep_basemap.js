// Clip Natural Earth coastlines/borders and GeoNames towns to each quake's map area -> data/basemap.json
// Run from the repo root after `npm install`: node scripts/prep_basemap.js
const fs=require('fs');const topo=require('topojson-client');
const W=require('world-atlas/countries-10m.json');const L=require('world-atlas/land-10m.json');
const cities=require('cities.json/cities.json');
const D=JSON.parse(fs.readFileSync('data/sequences.json'));
const land=topo.feature(L,L.objects.land);
const borders=topo.mesh(W,W.objects.countries,(a,b)=>a!==b);
const LABELS={turkey:['Kahramanmaraş','Gaziantep','Antakya','Adıyaman','Malatya','Osmaniye','Adana','İskenderun','Hatay','Kilis','Nurdağı','Islahiye'],
 nepal:['Kathmandu','Pokhara','Bharatpur','Gorkha','Bidur','Hetauda','Dhading Besi','Besisahar'],
 darfield:['Christchurch','Darfield','Rangiora','Rolleston','Ashburton','Lyttelton','Kaiapoi'],
 noto:['Wajima','Suzu','Nanao','Kanazawa','Anamizu','Toyama','Hakui','Noto'],
 kaikoura:['Kaikoura','Blenheim','Wellington','Christchurch','Hanmer Springs','Culverden','Seddon','Picton'],
 ridgecrest:['Ridgecrest','Trona','Inyokern','Lone Pine','Bakersfield','Barstow','Lancaster','California City'],
 myanmar:['Mandalay','Sagaing','Nay Pyi Taw','Meiktila','Pyinmana','Shwebo','Monywa','Taunggyi'],
 kumamoto:['Kumamoto','Mashiki','Aso','Uto','Yatsushiro','Ōita','Kurume','Kikuchi'],
 ecuador:['Pedernales','Manta','Portoviejo','Esmeraldas','Muisne','Bahía de Caráquez','Chone','Jama','Quito','Santo Domingo de los Colorados'],
 morocco:['Marrakesh','Amizmiz','Taroudant','Ouarzazate','Asni','Talat n Yaaqoub','Chichaoua'],
 indonesia26:['Ende','Maumere','Bajawa','Labuan Bajo','Ruteng','Waingapu','Larantuka'],
 panama26:['Santiago de Veraguas','Soná','Las Tablas','Chitré','Penonomé','David','Aguadulce','Santiago'],
 nagqu26:['Nagqu','Biru','Sog','Amdo','Baqên']};
function sh(ring,b){// Sutherland-Hodgman clip to rectangle
 const edges=[[p=>p[0]>=b.w,(a,c)=>{const t=(b.w-a[0])/(c[0]-a[0]);return[b.w,a[1]+t*(c[1]-a[1])]}],[p=>p[0]<=b.e,(a,c)=>{const t=(b.e-a[0])/(c[0]-a[0]);return[b.e,a[1]+t*(c[1]-a[1])]}],
  [p=>p[1]>=b.s,(a,c)=>{const t=(b.s-a[1])/(c[1]-a[1]);return[a[0]+t*(c[0]-a[0]),b.s]}],[p=>p[1]<=b.n,(a,c)=>{const t=(b.n-a[1])/(c[1]-a[1]);return[a[0]+t*(c[0]-a[0]),b.n]}]];
 let out=ring;for(const [ins,cut] of edges){const inp=out;out=[];for(let i=0;i<inp.length;i++){const cur=inp[i],prev=inp[(i+inp.length-1)%inp.length];
  if(ins(cur)){if(!ins(prev))out.push(cut(prev,cur));out.push(cur)}else if(ins(prev))out.push(cut(prev,cur))}if(!out.length)break}return out}
function clipLine(line,b){const segs=[];let cur=[];const inb=p=>p[0]>=b.w&&p[0]<=b.e&&p[1]>=b.s&&p[1]<=b.n;for(const p of line){if(inb(p))cur.push(p);else{if(cur.length>1)segs.push(cur);cur=[]}}if(cur.length>1)segs.push(cur);return segs}
function clipGeom(geom,b){const out=[];const polys=geom.type==='MultiPolygon'?geom.coordinates:geom.type==='Polygon'?[geom.coordinates]:geom.type==='MultiLineString'?geom.coordinates.map(l=>[l]):[[geom.coordinates]];
 for(const poly of polys)for(const ring of poly){let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;for(const [x,y] of ring){mnx=Math.min(mnx,x);mxx=Math.max(mxx,x);mny=Math.min(mny,y);mxy=Math.max(mxy,y)}
  if(mxx<b.w||mnx>b.e||mxy<b.s||mny>b.n)continue;const r=[];let last=null;
  const parts=geom.type.includes('Line')?clipLine(ring,b):[sh(ring,b)];
  for(const part of parts){const r=[];let last=null;for(const [x,y] of part){if(last&&Math.abs(x-last[0])<0.008&&Math.abs(y-last[1])<0.008)continue;r.push([+x.toFixed(3),+y.toFixed(3)]);last=[x,y]}if(r.length>1)out.push(r)}}return out}
const base={};
for(const s of D.sequences){const sm=D.shakemaps[s.key];let w=sm.lon0,e=sm.lon0+(sm.nc-1)*sm.dlon,n=sm.lat0,so=sm.lat0-(sm.nr-1)*sm.dlat;
 const pad=0.3,b={w:w-pad,e:e+pad,s:so-pad,n:n+pad};
 let landRings=[];for(const f of land.features)landRings.push(...clipGeom(f.geometry,b));
 const bord=clipGeom(borders,b);
 // Kaikoura grid passes 180: keep positive lons
 const inBox=c=>{const x=+c.lng,y=+c.lat;return x>=w&&x<=e&&y>=so&&y<=n};
 const towns=cities.filter(inBox).map(c=>[c.name,+(+c.lat).toFixed(4),+(+c.lng).toFixed(4),c.country]);
 const want=LABELS[s.key]||[];const lab=[];for(const nm of want){const t=towns.find(t=>t[0]===nm)||towns.find(t=>t[0].normalize('NFD').replace(/[̀-ͯ]/g,'')===nm.normalize('NFD').replace(/[̀-ͯ]/g,''));if(t&&!lab.includes(t[0]))lab.push(t[0])}
 base[s.key]={land:landRings,borders:bord,towns,labels:lab};
 console.log(s.key.padEnd(12),'land rings',landRings.length,'pts',landRings.reduce((a,r)=>a+r.length,0),'borders',bord.length,'towns',towns.length,'labels',lab.join(', '));}
fs.writeFileSync('data/basemap.json',JSON.stringify(base));console.log('bytes',fs.statSync('data/basemap.json').size);
