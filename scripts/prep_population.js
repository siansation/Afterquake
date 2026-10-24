// Town populations (GeoNames via all-the-cities) and USGS PAGER country fatality curves -> data/population.json,
// plus every town of 5,000+ people worldwide for live earthquakes on the globe -> data/world-towns.json
// Run from the repo root after `npm install`: node scripts/prep_population.js
const fs=require('fs');const cities=require('all-the-cities');
const D=JSON.parse(fs.readFileSync('data/sequences.json'));
// PAGER empirical fatality model (Jaiswal & Wald): rate(MMI) = Phi(ln(MMI/theta)/beta) per country
(async()=>{
const res=await fetch('https://raw.githubusercontent.com/usgs/pager/master/losspager/data/fatality.xml');
if(!res.ok)throw new Error(`PAGER fatality.xml: HTTP ${res.status}`);
const xml=await res.text();
const FAT={};for(const m of xml.matchAll(/<model ccode="(\w+)" theta="([\d.]+)" fform="\w+" beta="([\d.]+)"/g))FAT[m[1]]=[+m[2],+m[3]];
const SEQC={turkey:'TR',nepal:'NP',darfield:'NZ',noto:'JP',kaikoura:'NZ',ridgecrest:'US',myanmar:'MM',kumamoto:'JP',ecuador:'EC',morocco:'MA',indonesia26:'ID',panama26:'PA',nagqu26:'CN'};
const towns={};
for(const s of D.sequences){const sm=D.shakemaps[s.key];const w=sm.lon0,e=sm.lon0+(sm.nc-1)*sm.dlon,n=sm.lat0,so=sm.lat0-(sm.nr-1)*sm.dlat;
  const t=cities.filter(c=>{const [lon,lat]=c.loc.coordinates;return lon>=w&&lon<=e&&lat>=so&&lat<=n&&c.population>0})
    .map(c=>[c.name,+c.loc.coordinates[1].toFixed(4),+c.loc.coordinates[0].toFixed(4),c.population,c.country]).sort((a,b)=>b[3]-a[3]);
  towns[s.key]={towns:t,country:SEQC[s.key]}}
// Keep every country's curve: live earthquakes on the globe can happen anywhere.
const fatality=Object.fromEntries(Object.keys(FAT).sort().map(c=>[c,FAT[c]]));
fs.writeFileSync('data/population.json',JSON.stringify({towns,fatality,seqCountry:SEQC}));
console.log('countries',Object.keys(fatality).length,'bytes',fs.statSync('data/population.json').size);
const world=cities.filter(c=>c.population>=5000).map(c=>[c.name,+c.loc.coordinates[1].toFixed(3),+c.loc.coordinates[0].toFixed(3),c.population,c.country]).sort((a,b)=>b[3]-a[3]);
fs.writeFileSync('data/world-towns.json',JSON.stringify(world));
console.log('world towns',world.length,'bytes',fs.statSync('data/world-towns.json').size);
})().catch(e=>{console.error(e);process.exit(1)});
